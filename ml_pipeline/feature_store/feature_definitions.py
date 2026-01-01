"""
Feast Feature Definitions for Music Recommendation System

يحدد هذا الملف Feature Views و Entities للنظام:
- User features (listening stats, preferences)
- Track features (audio features, popularity)
- Context features (time, mood, activity)
"""

from datetime import timedelta
from pathlib import Path

from feast import Entity, FeatureView, Field, PushSource, RedisSource
from feast.data_source import RequestSource
from feast.types import Float32, Float64, Int64, String, UnixTimestamp
from feast.on_demand_feature_view import on_demand_feature_view
from feast.feature_view import FeatureView
from feast import ValueType


# ==================== Entities ====================

user_entity = Entity(
    name="user",
    join_keys=["external_user_id"],
    description="User entity for music recommendation"
)

track_entity = Entity(
    name="track",
    join_keys=["track_id"],
    description="Track entity for music recommendation"
)


# ==================== Feature Sources ====================

# User stats push source (materialized from DB)
user_stats_source = PushSource(
    name="user_stats_push",
    batch_source=RedisSource(
        name="user_stats_redis",
        timestamp_field="event_timestamp"
    )
)

# Track features push source
track_features_source = PushSource(
    name="track_features_push",
    batch_source=RedisSource(
        name="track_features_redis",
        timestamp_field="event_timestamp"
    )
)


# ==================== Feature Views ====================

# User listening statistics (7-day window)
user_listening_stats = FeatureView(
    name="user_listening_stats",
    entities=[user_entity],
    ttl=timedelta(days=7),
    schema=[
        Field(name="play_count_7d", dtype=Int64, description="Number of plays in last 7 days"),
        Field(name="like_count_7d", dtype=Int64, description="Number of likes in last 7 days"),
        Field(name="skip_count_7d", dtype=Int64, description="Number of skips in last 7 days"),
        Field(name="unique_tracks_7d", dtype=Int64, description="Unique tracks played in last 7 days"),
        Field(name="unique_artists_7d", dtype=Int64, description="Unique artists played in last 7 days"),
        Field(name="like_rate_7d", dtype=Float32, description="Like rate (likes / plays)"),
        Field(name="skip_rate_7d", dtype=Float32, description="Skip rate (skips / plays)"),
        Field(name="event_timestamp", dtype=UnixTimestamp),
    ],
    source=user_stats_source,
    online=True,
    tags={"team": "ml", "category": "user_stats"}
)

# User audio preferences (average audio features)
user_audio_preferences = FeatureView(
    name="user_audio_preferences",
    entities=[user_entity],
    ttl=timedelta(days=30),
    schema=[
        Field(name="avg_energy", dtype=Float32, description="Average energy of liked tracks"),
        Field(name="avg_valence", dtype=Float32, description="Average valence (happiness) of liked tracks"),
        Field(name="avg_danceability", dtype=Float32, description="Average danceability of liked tracks"),
        Field(name="avg_acousticness", dtype=Float32, description="Average acousticness of liked tracks"),
        Field(name="avg_instrumentalness", dtype=Float32, description="Average instrumentalness"),
        Field(name="avg_tempo", dtype=Float32, description="Average tempo (BPM)"),
        Field(name="event_timestamp", dtype=UnixTimestamp),
    ],
    source=user_stats_source,
    online=True,
    tags={"team": "ml", "category": "user_preferences"}
)

# Track audio features
track_audio_features = FeatureView(
    name="track_audio_features",
    entities=[track_entity],
    ttl=timedelta(days=365),
    schema=[
        Field(name="energy", dtype=Float32, description="Track energy level"),
        Field(name="valence", dtype=Float32, description="Track valence (happiness)"),
        Field(name="danceability", dtype=Float32, description="Track danceability"),
        Field(name="acousticness", dtype=Float32, description="Track acousticness"),
        Field(name="instrumentalness", dtype=Float32, description="Track instrumentalness"),
        Field(name="tempo", dtype=Float32, description="Track tempo (BPM)"),
        Field(name="loudness", dtype=Float32, description="Track loudness (dB)"),
        Field(name="speechiness", dtype=Float32, description="Track speechiness"),
        Field(name="event_timestamp", dtype=UnixTimestamp),
    ],
    source=track_features_source,
    online=True,
    tags={"team": "ml", "category": "track_features"}
)

# Track popularity metrics
track_popularity = FeatureView(
    name="track_popularity",
    entities=[track_entity],
    ttl=timedelta(days=7),
    schema=[
        Field(name="play_count_7d", dtype=Int64, description="Total plays in last 7 days"),
        Field(name="like_count_7d", dtype=Int64, description="Total likes in last 7 days"),
        Field(name="skip_count_7d", dtype=Int64, description="Total skips in last 7 days"),
        Field(name="unique_users_7d", dtype=Int64, description="Unique users in last 7 days"),
        Field(name="popularity_score", dtype=Float32, description="Popularity score (0-1)"),
        Field(name="event_timestamp", dtype=UnixTimestamp),
    ],
    source=track_features_source,
    online=True,
    tags={"team": "ml", "category": "track_popularity"}
)

# User-Track interaction features (30-day window)
user_track_interactions = FeatureView(
    name="user_track_interactions",
    entities=[user_entity, track_entity],
    ttl=timedelta(days=30),
    schema=[
        Field(name="play_count_30d", dtype=Int64, description="Play count for this user-track pair"),
        Field(name="last_interaction_type", dtype=String, description="Last interaction type (PLAY/LIKE/SKIP)"),
        Field(name="days_since_last_play", dtype=Int64, description="Days since last play"),
        Field(name="event_timestamp", dtype=UnixTimestamp),
    ],
    source=user_stats_source,
    online=True,
    tags={"team": "ml", "category": "user_track"}
)


# ==================== On-Demand Feature Views ====================

# Context-aware features computed at request time
context_input = RequestSource(
    name="context_input",
    schema=[
        Field(name="mood", dtype=String),
        Field(name="activity", dtype=String),
        Field(name="time_of_day", dtype=String),
        Field(name="day_of_week", dtype=Int64),
    ]
)


@on_demand_feature_view(
    sources=[
        context_input,
        user_audio_preferences,
        track_audio_features
    ],
    schema=[
        Field(name="context_match_score", dtype=Float32),
        Field(name="energy_match", dtype=Float32),
        Field(name="valence_match", dtype=Float32),
    ]
)
def context_aware_features(inputs: dict) -> dict:
    """
    Compute context-aware matching scores between user preferences and track features
    """
    # Extract features
    mood = inputs.get("mood", ["NEUTRAL"])[0]
    activity = inputs.get("activity", ["GENERAL"])[0]

    user_energy = inputs.get("avg_energy", [0.5])[0]
    user_valence = inputs.get("avg_valence", [0.5])[0]

    track_energy = inputs.get("energy", [0.5])[0]
    track_valence = inputs.get("valence", [0.5])[0]

    # Energy matching
    energy_match = 1.0 - abs(user_energy - track_energy)

    # Valence matching
    valence_match = 1.0 - abs(user_valence - track_valence)

    # Context-based adjustments
    context_score = 0.5

    if activity == "EXERCISE" and track_energy > 0.7:
        context_score += 0.3
    elif activity == "RELAX" and track_energy < 0.4:
        context_score += 0.3
    elif activity == "WORK" and 0.4 <= track_energy <= 0.6:
        context_score += 0.2

    if mood == "ENERGETIC" and track_energy > 0.6:
        context_score += 0.2
    elif mood == "CALM" and track_energy < 0.5:
        context_score += 0.2
    elif mood == "HAPPY" and track_valence > 0.6:
        context_score += 0.2
    elif mood == "SAD" and track_valence < 0.4:
        context_score += 0.2

    # Clamp to [0, 1]
    context_score = max(0.0, min(1.0, context_score))

    return {
        "context_match_score": [context_score],
        "energy_match": [energy_match],
        "valence_match": [valence_match],
    }


# List all feature views for easy registration
ALL_FEATURE_VIEWS = [
    user_listening_stats,
    user_audio_preferences,
    track_audio_features,
    track_popularity,
    user_track_interactions,
    context_aware_features,
]

ALL_ENTITIES = [
    user_entity,
    track_entity,
]
