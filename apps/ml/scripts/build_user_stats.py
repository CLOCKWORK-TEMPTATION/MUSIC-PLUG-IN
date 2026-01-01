import os
from datetime import datetime, timezone

import pandas as pd

from app.pg import PG


def main() -> None:
    out_dir = os.path.join(os.path.dirname(__file__), "..", "feast_repo", "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "user_stats.parquet")

    db = PG.from_env()

    rows = db.fetchall(
        """
        SELECT
          external_user_id,
          COUNT(*) FILTER (WHERE event_type='PLAY' AND created_at > NOW() - INTERVAL '7 days') AS play_7d,
          COUNT(*) FILTER (WHERE event_type='LIKE' AND created_at > NOW() - INTERVAL '7 days') AS like_7d,
          COUNT(*) FILTER (WHERE event_type='SKIP' AND created_at > NOW() - INTERVAL '7 days') AS skip_7d
        FROM interactions
        GROUP BY external_user_id
        """
    )

    if not rows:
        print("No interactions yet - skipping parquet creation")
        return

    df = pd.DataFrame(rows)
    df["like_rate_7d"] = (df["like_7d"] / (df["play_7d"].replace(0, 1))).astype("float32")
    df["event_timestamp"] = datetime.now(timezone.utc)

    df.to_parquet(out_path, index=False)
    print(f"Wrote: {out_path} rows={len(df)}")


if __name__ == "__main__":
    main()
