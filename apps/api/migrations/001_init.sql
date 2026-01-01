-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create event_type enum
CREATE TYPE event_type AS ENUM ('PLAY', 'SKIP', 'LIKE', 'DISLIKE', 'ADD_TO_PLAYLIST');

-- Tracks table
CREATE TABLE tracks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    artist VARCHAR(500) NOT NULL,
    album VARCHAR(500),
    genre VARCHAR(100) NOT NULL,
    duration_sec INTEGER NOT NULL CHECK (duration_sec > 0),
    external_url TEXT NOT NULL,
    preview_url TEXT,
    audio_features JSONB,
    embedding vector(256),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes on tracks
CREATE INDEX idx_tracks_artist ON tracks(artist);
CREATE INDEX idx_tracks_genre ON tracks(genre);
CREATE INDEX idx_tracks_created_at ON tracks(created_at DESC);

-- HNSW index for vector similarity search (more efficient than IVFFlat for most use cases)
CREATE INDEX idx_tracks_embedding_hnsw ON tracks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- User profiles table
CREATE TABLE user_profiles (
    external_user_id VARCHAR(255) PRIMARY KEY,
    preferred_genres TEXT[] DEFAULT '{}',
    disliked_genres TEXT[] DEFAULT '{}',
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    profile_embedding vector(256),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index on user_profiles
CREATE INDEX idx_user_profiles_last_active ON user_profiles(last_active_at DESC);

-- Optional: HNSW index on user profile embeddings for similarity-based user matching
CREATE INDEX idx_user_profiles_embedding_hnsw ON user_profiles
USING hnsw (profile_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Interactions table
CREATE TABLE interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_user_id VARCHAR(255) NOT NULL,
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    event_type event_type NOT NULL,
    event_value INTEGER,
    context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Critical indexes for interactions
CREATE INDEX idx_interactions_user_created ON interactions(external_user_id, created_at DESC);
CREATE INDEX idx_interactions_track ON interactions(track_id);
CREATE INDEX idx_interactions_event_type ON interactions(event_type);
CREATE INDEX idx_interactions_created_at ON interactions(created_at DESC);

-- Composite index for skip detection queries
CREATE INDEX idx_interactions_user_skip_recent ON interactions(external_user_id, event_type, created_at DESC)
WHERE event_type = 'SKIP';

-- Playlists table
CREATE TABLE playlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_user_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index on playlists
CREATE INDEX idx_playlists_user_created ON playlists(external_user_id, created_at DESC);

-- Playlist tracks junction table
CREATE TABLE playlist_tracks (
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (playlist_id, track_id)
);

-- Index on playlist_tracks
CREATE INDEX idx_playlist_tracks_playlist ON playlist_tracks(playlist_id, added_at DESC);
CREATE INDEX idx_playlist_tracks_track ON playlist_tracks(track_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for user_profiles
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for playlists
CREATE TRIGGER update_playlists_updated_at BEFORE UPDATE ON playlists
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Materialized view for popular tracks (used in cold start)
CREATE MATERIALIZED VIEW popular_tracks AS
SELECT
    t.id,
    t.title,
    t.artist,
    t.album,
    t.genre,
    t.duration_sec,
    t.external_url,
    t.preview_url,
    t.audio_features,
    t.embedding,
    COUNT(CASE WHEN i.event_type IN ('PLAY', 'LIKE') THEN 1 END) as popularity_score,
    COUNT(CASE WHEN i.event_type = 'SKIP' THEN 1 END) as skip_count
FROM tracks t
LEFT JOIN interactions i ON t.id = i.track_id
GROUP BY t.id
ORDER BY popularity_score DESC, skip_count ASC;

-- Index on materialized view
CREATE INDEX idx_popular_tracks_genre ON popular_tracks(genre, popularity_score DESC);
CREATE INDEX idx_popular_tracks_score ON popular_tracks(popularity_score DESC);

-- Refresh function for popular_tracks view
CREATE OR REPLACE FUNCTION refresh_popular_tracks()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY popular_tracks;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO music_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO music_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO music_user;
