import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine


@dataclass
class PG:
    engine: Engine

    @staticmethod
    def from_env() -> "PG":
        url = os.getenv("DATABASE_URL")
        if not url:
            # same default as docker-compose
            url = "postgresql+psycopg2://music_user:music_pass_dev@postgres:5432/music_rec"
        engine = create_engine(url, pool_pre_ping=True)
        return PG(engine=engine)

    def fetchall(self, sql: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        with self.engine.connect() as conn:
            res = conn.execute(text(sql), params or {})
            rows = [dict(r._mapping) for r in res.fetchall()]
            return rows

    def fetchone(self, sql: str, params: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        with self.engine.connect() as conn:
            res = conn.execute(text(sql), params or {})
            row = res.fetchone()
            return dict(row._mapping) if row else None
