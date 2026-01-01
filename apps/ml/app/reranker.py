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

        try:
            import torch  # type: ignore

            self.torch_available = True
            # Lazy load: only if file exists
            if os.path.exists(self.model_path):
                self._torch = torch
                self._model = torch.load(self.model_path, map_location="cpu")
                self.model_loaded = True
                self.model_name = "sasrec"
        except Exception:
            self.torch_available = False
            self.model_loaded = False

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

        if self.model_loaded:
            # Placeholder: real SASRec inference requires mapping track ids -> indices
            # We keep this branch for future integration but do not block execution.
            scores = self._score_heuristic(meta, candidate_track_ids, context, recent_sequence, interest_graph)
        else:
            scores = self._score_heuristic(meta, candidate_track_ids, context, recent_sequence, interest_graph)

        # Return sorted
        items = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        return items[:limit]

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
