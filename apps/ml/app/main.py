import os
import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from app.pg import PG
from app.reranker import Reranker


class InteractionContext(BaseModel):
    mood: Optional[str] = None
    activity: Optional[str] = None
    timeBucket: Optional[str] = None


class RerankRequest(BaseModel):
    externalUserId: str = Field(..., min_length=1, max_length=255)
    candidateTrackIds: List[str] = Field(..., min_length=1)
    context: Optional[InteractionContext] = None
    # آخر تفاعلات (track ids) بترتيب الأقدم -> الأحدث (إن توفرت). إذا لم تُرسل، ستُسحب من DB.
    recentSequence: Optional[List[str]] = None
    # Interest graph اختياري (إن كان الـAPI قد حسبه بالفعل)
    interestGraph: Optional[Dict[str, Any]] = None
    limit: int = Field(20, ge=1, le=50)


class RerankItem(BaseModel):
    trackId: str
    score: float


class RerankResponse(BaseModel):
    tracks: List[RerankItem]
    model: str
    generatedAt: datetime


class HealthResponse(BaseModel):
    status: str
    torchAvailable: bool
    modelLoaded: bool


def create_app() -> FastAPI:
    app = FastAPI(title="Music Rec ML Service", version="1.0.0")

    db = PG.from_env()
    reranker = Reranker(db=db)

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            torchAvailable=reranker.torch_available,
            modelLoaded=reranker.model_loaded,
        )

    @app.post("/rerank", response_model=RerankResponse)
    def rerank(req: RerankRequest) -> RerankResponse:
        if not req.candidateTrackIds:
            raise HTTPException(status_code=400, detail="candidateTrackIds is required")

        items = reranker.rerank(
            external_user_id=req.externalUserId,
            candidate_track_ids=req.candidateTrackIds,
            context=req.context.model_dump() if req.context else None,
            recent_sequence=req.recentSequence,
            interest_graph=req.interestGraph,
            limit=req.limit,
        )

        return RerankResponse(
            tracks=[RerankItem(trackId=t_id, score=float(score)) for t_id, score in items],
            model=reranker.model_name,
            generatedAt=datetime.utcnow(),
        )

    @app.post("/train")
    def train(user_id: Optional[str] = None, epochs: int = 2) -> Dict[str, Any]:
        """تدريب خفيف (للتطوير فقط). في الإنتاج: اجعل التدريب خارج المسار الرئيسي (CI/Jobs)."""
        result = reranker.train(user_id=user_id, epochs=epochs)
        return {"ok": True, **result}

    return app


app = create_app()
