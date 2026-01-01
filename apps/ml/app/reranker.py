import os
import math
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.pg import PG


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        if x is None:
            return default
        return float(x)
    except Exception:
        return default


@dataclass
class Reranker:
    db: PG

    def __post_init__(self) -> None:
        self.model_path = os.getenv("SEQUENTIAL_MODEL_PATH", "/app/apps/ml/data/model.pt")
        self.model_name = "heuristic-seq"
        self.torch_available = False
        self.model_loaded = False
        self.feast_enabled = False
        self.feast_store = None

        # Initialize PyTorch model
        try:
            import torch  # type: ignore

            self.torch_available = True
            # Lazy load: only if file exists
            if os.path.exists(self.model_path):
                self._torch = torch
                self._model_data = torch.load(self.model_path, map_location="cpu")

                # Check if it's new format with model state dict
                if isinstance(self._model_data, dict) and 'model_state_dict' in self._model_data:
                    # Load SASRec model architecture
                    from ml_pipeline.train_transformer import SASRecModel

                    hyperparams = self._model_data['hyperparameters']
                    self._model = SASRecModel(
                        num_items=self._model_data['num_items'],
                        **hyperparams
                    )
                    self._model.load_state_dict(self._model_data['model_state_dict'])
                    self._model.eval()

                    self.track_to_idx = self._model_data['track_to_idx']
                    self.idx_to_track = self._model_data['idx_to_track']
                    self.model_loaded = True
                    self.model_name = "sasrec-transformer"
                else:
                    # Legacy format
                    self._model = self._model_data
                    self.model_loaded = True
                    self.model_name = "sasrec"
        except Exception as e:
            print(f"Warning: Failed to load PyTorch model: {e}")
            self.torch_available = False
            self.model_loaded = False

        # Initialize Feast Feature Store
        try:
            from feast import FeatureStore

            feast_repo = os.getenv("FEAST_REPO_PATH", "/ml_pipeline/feature_store/feast_repo")
            if os.path.exists(feast_repo):
                self.feast_store = FeatureStore(repo_path=feast_repo)
                self.feast_enabled = True
                print(f"✓ Feast Feature Store initialized from {feast_repo}")
        except Exception as e:
            print(f"Warning: Feast not available: {e}")
            self.feast_enabled = False

    def rerank(
        self,
        external_user_id: str,
        candidate_track_ids: List[str],
        context: Optional[Dict[str, Any]] = None,
        recent_sequence: Optional[List[str]] = None,
        interest_graph: Optional[Dict[str, Any]] = None,
        limit: int = 20,
    ) -> List[Tuple[str, float]]:
        # Load candidate metadata
        meta = self._fetch_track_meta(candidate_track_ids)

        if recent_sequence is None:
            recent_sequence = self._fetch_recent_sequence(external_user_id, limit=50)

        if interest_graph is None:
            interest_graph = self._fetch_interest_graph(external_user_id)

        # Fetch features from Feature Store if available
        feast_features = None
        if self.feast_enabled:
            feast_features = self._fetch_feast_features(external_user_id, candidate_track_ids, context)

        # Use Sequential Transformer if available
        if self.model_loaded and self.model_name == "sasrec-transformer":
            scores = self._score_with_transformer(
                meta, candidate_track_ids, context, recent_sequence, interest_graph, feast_features
            )
        else:
            # Fallback to heuristic scoring (enhanced with Feast features if available)
            scores = self._score_heuristic(
                meta, candidate_track_ids, context, recent_sequence, interest_graph, feast_features
            )

        # Return sorted
        items = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        return items[:limit]

    def _fetch_feast_features(
        self,
        user_id: str,
        track_ids: List[str],
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Fetch features from Feast Feature Store"""
        if not self.feast_enabled or not self.feast_store:
            return {}

        try:
            from datetime import datetime

            # Prepare entity rows
            entity_rows = [{"external_user_id": user_id}]

            # User features
            user_features = self.feast_store.get_online_features(
                features=[
                    "user_listening_stats:play_count_7d",
                    "user_listening_stats:like_rate_7d",
                    "user_listening_stats:skip_rate_7d",
                    "user_audio_preferences:avg_energy",
                    "user_audio_preferences:avg_valence",
                    "user_audio_preferences:avg_danceability",
                ],
                entity_rows=entity_rows
            ).to_dict()

            # Track features (for each candidate)
            track_features = {}
            for track_id in track_ids[:20]:  # Limit to avoid too many requests
                track_entity = [{"track_id": track_id}]
                try:
                    track_feat = self.feast_store.get_online_features(
                        features=[
                            "track_audio_features:energy",
                            "track_audio_features:valence",
                            "track_audio_features:danceability",
                            "track_popularity:popularity_score",
                        ],
                        entity_rows=track_entity
                    ).to_dict()
                    track_features[track_id] = track_feat
                except:
                    pass

            return {
                "user": user_features,
                "tracks": track_features
            }

        except Exception as e:
            print(f"Warning: Failed to fetch Feast features: {e}")
            return {}

    def _score_with_transformer(
        self,
        meta: Dict[str, Dict[str, Any]],
        candidate_ids: List[str],
        context: Optional[Dict[str, Any]],
        recent_sequence: List[str],
        interest_graph: Optional[Dict[str, Any]],
        feast_features: Optional[Dict[str, Any]] = None
    ) -> Dict[str, float]:
        """Score using SASRec Sequential Transformer"""

        # Convert recent sequence to indices
        seq_indices = []
        for track_id in recent_sequence[-50:]:  # Last 50 items
            if track_id in self.track_to_idx:
                seq_indices.append(self.track_to_idx[track_id])

        if len(seq_indices) < 3:
            # Fallback to heuristic if sequence too short
            return self._score_heuristic(meta, candidate_ids, context, recent_sequence, interest_graph, feast_features)

        # Get transformer predictions
        predictions = self._model.predict_next(seq_indices, top_k=100)

        # Map predictions to track IDs
        transformer_scores = {}
        for idx, score in predictions:
            if idx in self.idx_to_track:
                track_id = self.idx_to_track[idx]
                transformer_scores[track_id] = score

        # Combine with heuristic scores
        heuristic_scores = self._score_heuristic(meta, candidate_ids, context, recent_sequence, interest_graph, feast_features)

        # Hybrid scoring: 70% transformer, 30% heuristic
        final_scores = {}
        for track_id in candidate_ids:
            transformer_score = transformer_scores.get(track_id, 0.0)
            heuristic_score = heuristic_scores.get(track_id, 0.0)

            # Normalize heuristic to [0, 1]
            normalized_heuristic = min(1.0, heuristic_score)

            final_scores[track_id] = 0.7 * transformer_score + 0.3 * normalized_heuristic

        return final_scores

    def train(self, user_id: Optional[str] = None, epochs: int = 2) -> Dict[str, Any]:
        """تدريب SASRec-like (هيكل فقط). للتنفيذ الحقيقي: فعّل INSTALL_TORCH=1."""
        if not self.torch_available:
            return {
                "trained": False,
                "reason": "torch_not_installed",
                "hint": "Install optional requirements-ml.txt or build Docker with INSTALL_TORCH=1",
            }

        # تدريب فعلي غير مفعل هنا لتجنب تكلفة عالية داخل الـMVP.
        # لكننا نضع نقطة دخول ثابتة حتى تستطيع تشغيلها كـJob خارجي.
        return {
            "trained": False,
            "reason": "training_not_enabled_in_mvp",
            "epochs": epochs,
            "userId": user_id,
            "next": "Implement offline training job (apps/ml/scripts/train_sasrec.py) and save model to SEQUENTIAL_MODEL_PATH",
        }

    def _fetch_track_meta(self, track_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        if not track_ids:
            return {}

        # Keep order list, fetch with IN
        sql = """
        SELECT id, title, artist, genre, audio_features
        FROM tracks
        WHERE id = ANY(:ids)
        """
        rows = self.db.fetchall(sql, {"ids": track_ids})
        return {r["id"]: r for r in rows}

    def _fetch_recent_sequence(self, external_user_id: str, limit: int = 50) -> List[str]:
        sql = """
        SELECT track_id
        FROM interactions
        WHERE external_user_id = :uid
          AND event_type IN ('PLAY','LIKE','SKIP')
        ORDER BY created_at DESC
        LIMIT :limit
        """
        rows = self.db.fetchall(sql, {"uid": external_user_id, "limit": limit})
        # Return oldest -> newest
        seq = [r["track_id"] for r in rows][::-1]
        return seq

    def _fetch_interest_graph(self, external_user_id: str) -> Optional[Dict[str, Any]]:
        row = self.db.fetchone(
            "SELECT graph FROM user_interest_graph WHERE external_user_id = :uid",
            {"uid": external_user_id},
        )
        if not row:
            return None
        g = row.get("graph")
        if isinstance(g, dict):
            return g
        try:
            return json.loads(g) if g else None
        except Exception:
            return None

    def _score_heuristic(
        self,
        meta: Dict[str, Dict[str, Any]],
        candidate_ids: List[str],
        context: Optional[Dict[str, Any]],
        recent_sequence: List[str],
        interest_graph: Optional[Dict[str, Any]],
        feast_features: Optional[Dict[str, Any]] = None
    ) -> Dict[str, float]:
        # Base score: inverse of original rank (candidate order)
        base = {tid: 1.0 / (idx + 1) for idx, tid in enumerate(candidate_ids)}

        # Sequence continuity: prefer artist/genre continuity with last listened
        last_id = recent_sequence[-1] if recent_sequence else None
        last = meta.get(last_id) if last_id else None

        # Interest graph weights
        top_artists = {}
        top_genres = {}
        if interest_graph:
            top_artists = (interest_graph.get("topArtists") or {})
            top_genres = (interest_graph.get("topGenres") or {})

        mood = (context or {}).get("mood")
        activity = (context or {}).get("activity")

        scores: Dict[str, float] = {}
        for tid in candidate_ids:
            m = meta.get(tid, {})
            s = base.get(tid, 0.0)

            artist = m.get("artist")
            genre = m.get("genre")

            # Continuity boost
            if last:
                if artist and artist == last.get("artist"):
                    s += 0.15
                if genre and genre == last.get("genre"):
                    s += 0.10

            # Interest-graph boost
            if artist and artist in top_artists:
                s += 0.20 * _safe_float(top_artists.get(artist), 0.0)
            if genre and genre in top_genres:
                s += 0.15 * _safe_float(top_genres.get(genre), 0.0)

            # Context boost (إذا كانت audio_features موجودة)
            af = m.get("audio_features") or {}
            if isinstance(af, str):
                try:
                    af = json.loads(af)
                except Exception:
                    af = {}

            energy = _safe_float(af.get("energy"), 0.0)
            valence = _safe_float(af.get("valence"), 0.0)
            danceability = _safe_float(af.get("danceability"), 0.0)

            if activity == "EXERCISE":
                s += 0.10 * energy + 0.05 * danceability
            elif activity == "RELAX":
                s += 0.10 * (1 - energy)
            elif activity == "PARTY":
                s += 0.12 * danceability + 0.06 * energy
            elif activity == "WORK":
                # work: تفضيل توازن متوسط
                s += 0.05 * (1 - abs(energy - 0.5))

            if mood == "CALM":
                s += 0.08 * (1 - energy)
            elif mood == "ENERGETIC":
                s += 0.08 * energy
            elif mood == "HAPPY":
                s += 0.07 * valence
            elif mood == "SAD":
                s += 0.07 * (1 - valence)

            scores[tid] = float(s)

        return scores
