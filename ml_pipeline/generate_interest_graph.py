#!/usr/bin/env python3
"""
Interest Graph Generation with LLM

يستخدم هذا السكريبت LLM (Claude/GPT) لتحليل تاريخ تفاعلات المستخدم
وبناء Interest Graph ديناميكي يتتبع تطور ذوقه الموسيقي.

Usage:
    python generate_interest_graph.py --user-id user123 --provider anthropic
    python generate_interest_graph.py --all-users --batch-size 100
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

import pandas as pd
from sqlalchemy import create_engine, text


# LLM Providers
def call_anthropic_llm(prompt: str, api_key: str, model: str = "claude-3-5-sonnet-20241022") -> str:
    """استدعاء Claude API"""
    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=api_key)
        message = client.messages.create(
            model=model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text
    except Exception as e:
        print(f"❌ Anthropic API error: {e}")
        return ""


def call_openai_llm(prompt: str, api_key: str, model: str = "gpt-4o") -> str:
    """استدعاء OpenAI API"""
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=2048
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"❌ OpenAI API error: {e}")
        return ""


@dataclass
class UserInteractionSummary:
    """ملخص تفاعلات المستخدم"""
    user_id: str
    total_plays: int
    total_likes: int
    total_skips: int
    unique_tracks: int
    unique_artists: int
    unique_genres: int
    top_artists: List[Dict[str, Any]]
    top_genres: List[Dict[str, Any]]
    recent_tracks: List[Dict[str, Any]]
    listening_times: Dict[str, int]  # hour -> count
    avg_energy: float
    avg_valence: float
    avg_danceability: float


def fetch_user_summary(db_url: str, user_id: str, days: int = 90) -> Optional[UserInteractionSummary]:
    """استخراج ملخص شامل لتفاعلات المستخدم"""
    engine = create_engine(db_url)

    # Period filter
    cutoff_date = datetime.now() - timedelta(days=days)

    # Main interactions
    interactions_query = """
    SELECT
        i.event_type,
        i.track_id,
        i.created_at,
        t.title,
        t.artist,
        t.genre,
        t.audio_features,
        EXTRACT(HOUR FROM i.created_at) as hour
    FROM interactions i
    LEFT JOIN tracks t ON i.track_id = t.id
    WHERE i.external_user_id = :user_id
      AND i.created_at >= :cutoff
    ORDER BY i.created_at DESC
    """

    df = pd.read_sql(
        interactions_query,
        engine,
        params={'user_id': user_id, 'cutoff': cutoff_date}
    )

    if df.empty:
        return None

    # Aggregate stats
    total_plays = len(df[df['event_type'] == 'PLAY'])
    total_likes = len(df[df['event_type'] == 'LIKE'])
    total_skips = len(df[df['event_type'] == 'SKIP'])

    unique_tracks = df['track_id'].nunique()
    unique_artists = df['artist'].nunique()
    unique_genres = df['genre'].nunique()

    # Top artists
    top_artists = (
        df[df['artist'].notna()]
        .groupby('artist')
        .size()
        .sort_values(ascending=False)
        .head(10)
        .to_dict()
    )
    top_artists_list = [{'artist': k, 'count': v} for k, v in top_artists.items()]

    # Top genres
    top_genres = (
        df[df['genre'].notna()]
        .groupby('genre')
        .size()
        .sort_values(ascending=False)
        .head(10)
        .to_dict()
    )
    top_genres_list = [{'genre': k, 'count': v} for k, v in top_genres.items()]

    # Recent tracks (last 20)
    recent_tracks = df.head(20)[['track_id', 'title', 'artist', 'genre']].to_dict('records')

    # Listening times
    listening_times = df.groupby('hour').size().to_dict()

    # Audio features averages
    audio_features = []
    for af_json in df['audio_features'].dropna():
        if isinstance(af_json, str):
            try:
                af = json.loads(af_json)
                audio_features.append(af)
            except:
                continue
        elif isinstance(af_json, dict):
            audio_features.append(af_json)

    avg_energy = 0.0
    avg_valence = 0.0
    avg_danceability = 0.0

    if audio_features:
        avg_energy = sum(af.get('energy', 0) for af in audio_features) / len(audio_features)
        avg_valence = sum(af.get('valence', 0) for af in audio_features) / len(audio_features)
        avg_danceability = sum(af.get('danceability', 0) for af in audio_features) / len(audio_features)

    return UserInteractionSummary(
        user_id=user_id,
        total_plays=total_plays,
        total_likes=total_likes,
        total_skips=total_skips,
        unique_tracks=unique_tracks,
        unique_artists=unique_artists,
        unique_genres=unique_genres,
        top_artists=top_artists_list,
        top_genres=top_genres_list,
        recent_tracks=recent_tracks,
        listening_times=listening_times,
        avg_energy=avg_energy,
        avg_valence=avg_valence,
        avg_danceability=avg_danceability
    )


def build_llm_prompt(summary: UserInteractionSummary) -> str:
    """بناء Prompt لـ LLM"""

    prompt = f"""You are a music taste analyst. Analyze the following user's music listening behavior and generate a structured Interest Graph.

User Listening Summary:
- Total Plays: {summary.total_plays}
- Total Likes: {summary.total_likes}
- Total Skips: {summary.total_skips}
- Unique Tracks: {summary.unique_tracks}
- Unique Artists: {summary.unique_artists}
- Unique Genres: {summary.unique_genres}

Top Artists (by play count):
{json.dumps(summary.top_artists[:5], indent=2)}

Top Genres (by play count):
{json.dumps(summary.top_genres[:5], indent=2)}

Recent Tracks (last 20):
{json.dumps(summary.recent_tracks[:10], indent=2)}

Listening Times (hour of day -> count):
{json.dumps(summary.listening_times, indent=2)}

Average Audio Features:
- Energy: {summary.avg_energy:.2f}
- Valence: {summary.avg_valence:.2f}
- Danceability: {summary.avg_danceability:.2f}

Based on this data, generate a comprehensive Interest Graph with the following structure (return ONLY valid JSON):

{{
  "topArtists": {{"artist_name": weight_0_to_1, ...}},
  "topGenres": {{"genre_name": weight_0_to_1, ...}},
  "themes": ["theme1", "theme2", ...],
  "moods": ["mood1", "mood2", ...],
  "listeningPatterns": {{
    "preferredTimes": ["morning", "evening", ...],
    "averageEnergy": float,
    "averageValence": float,
    "averageDanceability": float
  }},
  "artistRelations": [
    {{"from": "artist1", "to": "artist2", "reason": "similar_genre"}},
    ...
  ],
  "insights": [
    "User prefers energetic rock in the evening",
    "Strong affinity for indie folk artists",
    ...
  ]
}}

Return ONLY the JSON object, no additional text.
"""

    return prompt


def parse_llm_response(response: str) -> Optional[Dict[str, Any]]:
    """استخراج JSON من رد LLM"""
    try:
        # Try direct parse
        return json.loads(response)
    except:
        # Try to extract JSON from markdown code blocks
        import re
        json_match = re.search(r'```json\s*(.*?)\s*```', response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except:
                pass

        # Try to find any JSON object
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except:
                pass

    return None


def save_interest_graph(db_url: str, user_id: str, graph: Dict[str, Any]):
    """حفظ Interest Graph في قاعدة البيانات"""
    engine = create_engine(db_url)

    with engine.connect() as conn:
        # Check if exists
        result = conn.execute(
            text("SELECT id FROM user_interest_graph WHERE external_user_id = :uid"),
            {'uid': user_id}
        )
        existing = result.fetchone()

        graph_json = json.dumps(graph)

        if existing:
            # Update
            conn.execute(
                text("""
                    UPDATE user_interest_graph
                    SET graph = :graph, updated_at = NOW()
                    WHERE external_user_id = :uid
                """),
                {'graph': graph_json, 'uid': user_id}
            )
        else:
            # Insert
            conn.execute(
                text("""
                    INSERT INTO user_interest_graph (external_user_id, graph, created_at, updated_at)
                    VALUES (:uid, :graph, NOW(), NOW())
                """),
                {'uid': user_id, 'graph': graph_json}
            )

        conn.commit()


def generate_interest_graph(
    db_url: str,
    user_id: str,
    llm_provider: str = 'anthropic',
    api_key: Optional[str] = None,
    days: int = 90
) -> bool:
    """توليد Interest Graph لمستخدم واحد"""

    print(f"🔍 Fetching user summary for {user_id}...")

    summary = fetch_user_summary(db_url, user_id, days=days)

    if not summary:
        print(f"⚠️  No interactions found for user {user_id}")
        return False

    print(f"✓ Found {summary.total_plays} plays, {summary.unique_tracks} unique tracks")

    # Build LLM prompt
    prompt = build_llm_prompt(summary)

    print(f"🤖 Calling {llm_provider} LLM...")

    # Call LLM
    if llm_provider == 'anthropic':
        api_key = api_key or os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            print("❌ ANTHROPIC_API_KEY not set")
            return False
        response = call_anthropic_llm(prompt, api_key)
    elif llm_provider == 'openai':
        api_key = api_key or os.getenv('OPENAI_API_KEY')
        if not api_key:
            print("❌ OPENAI_API_KEY not set")
            return False
        response = call_openai_llm(prompt, api_key)
    else:
        print(f"❌ Unknown LLM provider: {llm_provider}")
        return False

    if not response:
        print("❌ LLM returned empty response")
        return False

    # Parse response
    graph = parse_llm_response(response)

    if not graph:
        print("❌ Failed to parse LLM response as JSON")
        print(f"Response: {response[:500]}...")
        return False

    print(f"✓ Generated Interest Graph with {len(graph.get('insights', []))} insights")

    # Save to DB
    print(f"💾 Saving to database...")
    save_interest_graph(db_url, user_id, graph)

    print(f"✅ Interest Graph saved for user {user_id}")

    return True


def generate_all_users(
    db_url: str,
    llm_provider: str = 'anthropic',
    api_key: Optional[str] = None,
    batch_size: int = 100,
    min_interactions: int = 10
):
    """توليد Interest Graph لكل المستخدمين"""

    engine = create_engine(db_url)

    # Get active users
    query = f"""
    SELECT external_user_id, COUNT(*) as interaction_count
    FROM interactions
    GROUP BY external_user_id
    HAVING COUNT(*) >= {min_interactions}
    ORDER BY COUNT(*) DESC
    LIMIT {batch_size}
    """

    df = pd.read_sql(query, engine)

    print(f"📊 Found {len(df)} users with >= {min_interactions} interactions")

    success_count = 0
    fail_count = 0

    for idx, row in df.iterrows():
        user_id = row['external_user_id']
        print(f"\n[{idx + 1}/{len(df)}] Processing user: {user_id}")

        try:
            success = generate_interest_graph(
                db_url=db_url,
                user_id=user_id,
                llm_provider=llm_provider,
                api_key=api_key
            )

            if success:
                success_count += 1
            else:
                fail_count += 1

        except Exception as e:
            print(f"❌ Error processing user {user_id}: {e}")
            fail_count += 1

    print(f"\n📈 Summary:")
    print(f"   ✅ Success: {success_count}")
    print(f"   ❌ Failed: {fail_count}")


def main():
    parser = argparse.ArgumentParser(description='Generate Interest Graph using LLM')
    parser.add_argument('--db-url', type=str, default=os.getenv('DATABASE_URL'), help='Database URL')
    parser.add_argument('--user-id', type=str, help='Single user ID to process')
    parser.add_argument('--all-users', action='store_true', help='Process all users')
    parser.add_argument('--provider', type=str, default='anthropic', choices=['anthropic', 'openai'], help='LLM provider')
    parser.add_argument('--api-key', type=str, help='API key for LLM provider')
    parser.add_argument('--batch-size', type=int, default=100, help='Number of users to process (for --all-users)')
    parser.add_argument('--min-interactions', type=int, default=10, help='Minimum interactions required')
    parser.add_argument('--days', type=int, default=90, help='Days of history to analyze')

    args = parser.parse_args()

    if not args.db_url:
        print("❌ Error: DATABASE_URL not set")
        sys.exit(1)

    if args.all_users:
        generate_all_users(
            db_url=args.db_url,
            llm_provider=args.provider,
            api_key=args.api_key,
            batch_size=args.batch_size,
            min_interactions=args.min_interactions
        )
    elif args.user_id:
        success = generate_interest_graph(
            db_url=args.db_url,
            user_id=args.user_id,
            llm_provider=args.provider,
            api_key=args.api_key,
            days=args.days
        )
        sys.exit(0 if success else 1)
    else:
        print("❌ Error: Specify either --user-id or --all-users")
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
