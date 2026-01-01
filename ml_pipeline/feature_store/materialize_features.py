#!/usr/bin/env python3
"""
Feature Materialization Script

ينقل البيانات من PostgreSQL إلى Feature Store (Redis) لضمان اتساق السمات
بين التدريب والتوصية.

Usage:
    python materialize_features.py --feature-view user_listening_stats
    python materialize_features.py --all
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd
from feast import FeatureStore
from sqlalchemy import create_engine


def extract_user_listening_stats(db_url: str, days: int = 7) -> pd.DataFrame:
    """استخراج إحصائيات الاستماع للمستخدمين"""
    engine = create_engine(db_url)

    cutoff = datetime.now() - timedelta(days=days)

    query = f"""
    WITH user_interactions AS (
        SELECT
            external_user_id,
            event_type,
            COUNT(*) as event_count,
            COUNT(DISTINCT track_id) as unique_tracks,
            COUNT(DISTINCT (
                SELECT artist FROM tracks WHERE id = interactions.track_id
            )) as unique_artists
        FROM interactions
        WHERE created_at >= '{cutoff.isoformat()}'
        GROUP BY external_user_id, event_type
    )
    SELECT
        external_user_id,
        COALESCE(SUM(CASE WHEN event_type = 'PLAY' THEN event_count ELSE 0 END), 0) as play_count_7d,
        COALESCE(SUM(CASE WHEN event_type = 'LIKE' THEN event_count ELSE 0 END), 0) as like_count_7d,
        COALESCE(SUM(CASE WHEN event_type = 'SKIP' THEN event_count ELSE 0 END), 0) as skip_count_7d,
        MAX(unique_tracks) as unique_tracks_7d,
        MAX(unique_artists) as unique_artists_7d,
        CASE
            WHEN SUM(CASE WHEN event_type = 'PLAY' THEN event_count ELSE 0 END) > 0
            THEN CAST(SUM(CASE WHEN event_type = 'LIKE' THEN event_count ELSE 0 END) AS FLOAT) /
                 SUM(CASE WHEN event_type = 'PLAY' THEN event_count ELSE 0 END)
            ELSE 0
        END as like_rate_7d,
        CASE
            WHEN SUM(CASE WHEN event_type = 'PLAY' THEN event_count ELSE 0 END) > 0
            THEN CAST(SUM(CASE WHEN event_type = 'SKIP' THEN event_count ELSE 0 END) AS FLOAT) /
                 SUM(CASE WHEN event_type = 'PLAY' THEN event_count ELSE 0 END)
            ELSE 0
        END as skip_rate_7d,
        EXTRACT(EPOCH FROM NOW()) as event_timestamp
    FROM user_interactions
    GROUP BY external_user_id
    """

    df = pd.read_sql(query, engine)

    # Ensure timestamp is integer (Unix timestamp)
    df['event_timestamp'] = df['event_timestamp'].astype(int)

    return df


def extract_user_audio_preferences(db_url: str, days: int = 30) -> pd.DataFrame:
    """استخراج تفضيلات الصوت للمستخدمين (متوسط audio features من الأغاني المفضلة)"""
    engine = create_engine(db_url)

    cutoff = datetime.now() - timedelta(days=days)

    query = f"""
    SELECT
        i.external_user_id,
        AVG((t.audio_features->>'energy')::float) as avg_energy,
        AVG((t.audio_features->>'valence')::float) as avg_valence,
        AVG((t.audio_features->>'danceability')::float) as avg_danceability,
        AVG((t.audio_features->>'acousticness')::float) as avg_acousticness,
        AVG((t.audio_features->>'instrumentalness')::float) as avg_instrumentalness,
        AVG((t.audio_features->>'tempo')::float) as avg_tempo,
        EXTRACT(EPOCH FROM NOW()) as event_timestamp
    FROM interactions i
    JOIN tracks t ON i.track_id = t.id
    WHERE i.event_type IN ('PLAY', 'LIKE')
      AND i.created_at >= '{cutoff.isoformat()}'
      AND t.audio_features IS NOT NULL
    GROUP BY i.external_user_id
    HAVING COUNT(*) >= 5
    """

    df = pd.read_sql(query, engine)

    # Fill NaN with defaults
    df = df.fillna({
        'avg_energy': 0.5,
        'avg_valence': 0.5,
        'avg_danceability': 0.5,
        'avg_acousticness': 0.5,
        'avg_instrumentalness': 0.5,
        'avg_tempo': 120.0,
    })

    df['event_timestamp'] = df['event_timestamp'].astype(int)

    return df


def extract_track_audio_features(db_url: str) -> pd.DataFrame:
    """استخراج audio features للأغاني"""
    engine = create_engine(db_url)

    query = """
    SELECT
        id as track_id,
        (audio_features->>'energy')::float as energy,
        (audio_features->>'valence')::float as valence,
        (audio_features->>'danceability')::float as danceability,
        (audio_features->>'acousticness')::float as acousticness,
        (audio_features->>'instrumentalness')::float as instrumentalness,
        (audio_features->>'tempo')::float as tempo,
        (audio_features->>'loudness')::float as loudness,
        (audio_features->>'speechiness')::float as speechiness,
        EXTRACT(EPOCH FROM NOW()) as event_timestamp
    FROM tracks
    WHERE audio_features IS NOT NULL
    """

    df = pd.read_sql(query, engine)

    df = df.fillna({
        'energy': 0.5,
        'valence': 0.5,
        'danceability': 0.5,
        'acousticness': 0.5,
        'instrumentalness': 0.5,
        'tempo': 120.0,
        'loudness': -10.0,
        'speechiness': 0.1,
    })

    df['event_timestamp'] = df['event_timestamp'].astype(int)

    return df


def extract_track_popularity(db_url: str, days: int = 7) -> pd.DataFrame:
    """استخراج مقاييس شعبية الأغاني"""
    engine = create_engine(db_url)

    cutoff = datetime.now() - timedelta(days=days)

    query = f"""
    WITH track_stats AS (
        SELECT
            track_id,
            event_type,
            COUNT(*) as event_count,
            COUNT(DISTINCT external_user_id) as unique_users
        FROM interactions
        WHERE created_at >= '{cutoff.isoformat()}'
        GROUP BY track_id, event_type
    )
    SELECT
        track_id,
        COALESCE(SUM(CASE WHEN event_type = 'PLAY' THEN event_count ELSE 0 END), 0) as play_count_7d,
        COALESCE(SUM(CASE WHEN event_type = 'LIKE' THEN event_count ELSE 0 END), 0) as like_count_7d,
        COALESCE(SUM(CASE WHEN event_type = 'SKIP' THEN event_count ELSE 0 END), 0) as skip_count_7d,
        MAX(unique_users) as unique_users_7d,
        CASE
            WHEN SUM(event_count) > 0
            THEN LOG(1 + SUM(event_count)) / 10.0
            ELSE 0
        END as popularity_score,
        EXTRACT(EPOCH FROM NOW()) as event_timestamp
    FROM track_stats
    GROUP BY track_id
    """

    df = pd.read_sql(query, engine)

    df['popularity_score'] = df['popularity_score'].clip(0, 1)
    df['event_timestamp'] = df['event_timestamp'].astype(int)

    return df


def materialize_to_feast(
    feast_repo_path: str,
    feature_view_name: str,
    df: pd.DataFrame,
    entity_column: str
):
    """نقل البيانات إلى Feast Feature Store"""

    store = FeatureStore(repo_path=feast_repo_path)

    print(f"📊 Materializing {len(df)} rows to feature view: {feature_view_name}")
    print(f"   Entity column: {entity_column}")
    print(f"   Columns: {list(df.columns)}")

    # Push to online store (Redis)
    store.push(
        feature_view_name=feature_view_name,
        df=df,
        to=PushMode.ONLINE
    )

    print(f"✅ Successfully materialized to {feature_view_name}")


def materialize_all(db_url: str, feast_repo_path: str):
    """تنفيذ كل عمليات Materialization"""

    print("🚀 Starting full feature materialization...")

    # 1. User listening stats
    print("\n[1/4] User Listening Stats")
    try:
        df = extract_user_listening_stats(db_url)
        if not df.empty:
            materialize_to_feast(feast_repo_path, "user_listening_stats", df, "external_user_id")
        else:
            print("⚠️  No data found")
    except Exception as e:
        print(f"❌ Error: {e}")

    # 2. User audio preferences
    print("\n[2/4] User Audio Preferences")
    try:
        df = extract_user_audio_preferences(db_url)
        if not df.empty:
            materialize_to_feast(feast_repo_path, "user_audio_preferences", df, "external_user_id")
        else:
            print("⚠️  No data found")
    except Exception as e:
        print(f"❌ Error: {e}")

    # 3. Track audio features
    print("\n[3/4] Track Audio Features")
    try:
        df = extract_track_audio_features(db_url)
        if not df.empty:
            materialize_to_feast(feast_repo_path, "track_audio_features", df, "track_id")
        else:
            print("⚠️  No data found")
    except Exception as e:
        print(f"❌ Error: {e}")

    # 4. Track popularity
    print("\n[4/4] Track Popularity")
    try:
        df = extract_track_popularity(db_url)
        if not df.empty:
            materialize_to_feast(feast_repo_path, "track_popularity", df, "track_id")
        else:
            print("⚠️  No data found")
    except Exception as e:
        print(f"❌ Error: {e}")

    print("\n✅ Feature materialization complete!")


def main():
    parser = argparse.ArgumentParser(description='Materialize features to Feast')
    parser.add_argument('--db-url', type=str, default=os.getenv('DATABASE_URL'), help='Database URL')
    parser.add_argument(
        '--feast-repo',
        type=str,
        default='/ml_pipeline/feature_store/feast_repo',
        help='Feast repo path'
    )
    parser.add_argument('--feature-view', type=str, help='Specific feature view to materialize')
    parser.add_argument('--all', action='store_true', help='Materialize all feature views')

    args = parser.parse_args()

    if not args.db_url:
        print("❌ Error: DATABASE_URL not set")
        sys.exit(1)

    if args.all:
        materialize_all(args.db_url, args.feast_repo)
    elif args.feature_view:
        print(f"Materializing {args.feature_view}...")

        if args.feature_view == 'user_listening_stats':
            df = extract_user_listening_stats(args.db_url)
            materialize_to_feast(args.feast_repo, args.feature_view, df, 'external_user_id')
        elif args.feature_view == 'user_audio_preferences':
            df = extract_user_audio_preferences(args.db_url)
            materialize_to_feast(args.feast_repo, args.feature_view, df, 'external_user_id')
        elif args.feature_view == 'track_audio_features':
            df = extract_track_audio_features(args.db_url)
            materialize_to_feast(args.feast_repo, args.feature_view, df, 'track_id')
        elif args.feature_view == 'track_popularity':
            df = extract_track_popularity(args.db_url)
            materialize_to_feast(args.feast_repo, args.feature_view, df, 'track_id')
        else:
            print(f"❌ Unknown feature view: {args.feature_view}")
            sys.exit(1)
    else:
        print("❌ Error: Specify either --all or --feature-view")
        parser.print_help()
        sys.exit(1)


# Import PushMode from feast
try:
    from feast.data_source import PushMode
except ImportError:
    # Fallback for older versions
    class PushMode:
        ONLINE = "online"
        OFFLINE = "offline"


if __name__ == '__main__':
    main()
