"""
Import feature definitions into Feast repo

This file makes the feature definitions discoverable by Feast CLI.
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from feature_definitions import (
    ALL_ENTITIES,
    ALL_FEATURE_VIEWS,
    user_entity,
    track_entity,
    user_listening_stats,
    user_audio_preferences,
    track_audio_features,
    track_popularity,
    user_track_interactions,
    context_aware_features,
)
