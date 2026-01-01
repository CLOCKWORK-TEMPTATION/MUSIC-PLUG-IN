// User and Authentication Types
export interface UserProfile {
  externalUserId: string;
  preferredGenres: string[];
  dislikedGenres: string[];
  lastActiveAt: Date;
  profileEmbedding?: number[];
}

// Track Types
export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre: string;
  durationSec: number;
  externalUrl: string;
  previewUrl?: string;
  audioFeatures?: AudioFeatures;
  embedding?: number[];
  createdAt: Date;
}

export interface AudioFeatures {
  energy?: number;
  valence?: number;
  danceability?: number;
  tempo?: number;
  loudness?: number;
  speechiness?: number;
  acousticness?: number;
  instrumentalness?: number;
  liveness?: number;
  key?: number;
  mode?: number;
  timeSignature?: number;
}

// Interaction Types
export enum EventType {
  PLAY = 'PLAY',
  SKIP = 'SKIP',
  LIKE = 'LIKE',
  DISLIKE = 'DISLIKE',
  ADD_TO_PLAYLIST = 'ADD_TO_PLAYLIST',
}

export enum Mood {
  CALM = 'CALM',
  HAPPY = 'HAPPY',
  SAD = 'SAD',
  ENERGETIC = 'ENERGETIC',
}

export enum Activity {
  WORK = 'WORK',
  EXERCISE = 'EXERCISE',
  RELAX = 'RELAX',
  PARTY = 'PARTY',
}

export enum TimeBucket {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  EVENING = 'EVENING',
  NIGHT = 'NIGHT',
}

export interface InteractionContext {
  mood?: Mood;
  activity?: Activity;
  timeBucket?: TimeBucket;
}

export interface Interaction {
  id: string;
  externalUserId: string;
  trackId: string;
  eventType: EventType;
  eventValue?: number;
  context?: InteractionContext;
  createdAt: Date;
}

// Playlist Types
export interface Playlist {
  id: string;
  externalUserId: string;
  name: string;
  createdAt: Date;
  tracks?: Track[];
}

export interface PlaylistTrack {
  playlistId: string;
  trackId: string;
  addedAt: Date;
}

// API Request/Response Types
export interface RecommendationRequest {
  context?: InteractionContext;
  limit?: number;
}

export interface RecommendationResponse {
  tracks: Track[];
  context?: InteractionContext;
  generatedAt: Date;
}

export interface InteractionEvent {
  trackId: string;
  eventType: EventType;
  eventValue?: number;
  context?: InteractionContext;
  clientTs: string;
}

// WebSocket Event Types
export interface WebSocketEvent<T = unknown> {
  type: string;
  payload: T;
}

export interface RecommendationUpdateEvent {
  tracks: Track[];
  reason: 'skip_detected' | 'context_change' | 'manual_refresh';
}

// Authentication Types
export interface JWTPayload {
  sub: string; // external_user_id
  iss: string;
  aud: string;
  exp: number;
  iat: number;
}

export interface AuthenticatedRequest {
  externalUserId: string;
}
