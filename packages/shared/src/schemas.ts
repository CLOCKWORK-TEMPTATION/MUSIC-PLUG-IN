import { z } from 'zod';

// Enums
export const EventTypeSchema = z.enum(['PLAY', 'SKIP', 'LIKE', 'DISLIKE', 'ADD_TO_PLAYLIST']);

export const MoodSchema = z.enum(['CALM', 'HAPPY', 'SAD', 'ENERGETIC']);

export const ActivitySchema = z.enum(['WORK', 'EXERCISE', 'RELAX', 'PARTY']);

export const TimeBucketSchema = z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT']);

// Context Schema
export const InteractionContextSchema = z.object({
  mood: MoodSchema.optional(),
  activity: ActivitySchema.optional(),
  timeBucket: TimeBucketSchema.optional(),
});

// Audio Features Schema
export const AudioFeaturesSchema = z.object({
  energy: z.number().min(0).max(1).optional(),
  valence: z.number().min(0).max(1).optional(),
  danceability: z.number().min(0).max(1).optional(),
  tempo: z.number().positive().optional(),
  loudness: z.number().optional(),
  speechiness: z.number().min(0).max(1).optional(),
  acousticness: z.number().min(0).max(1).optional(),
  instrumentalness: z.number().min(0).max(1).optional(),
  liveness: z.number().min(0).max(1).optional(),
  key: z.number().int().min(0).max(11).optional(),
  mode: z.number().int().min(0).max(1).optional(),
  timeSignature: z.number().int().min(3).max(7).optional(),
});

// Track Schema
export const TrackSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500),
  artist: z.string().min(1).max(500),
  album: z.string().max(500).optional(),
  genre: z.string().min(1).max(100),
  durationSec: z.number().int().positive(),
  externalUrl: z.string().url(),
  previewUrl: z.string().url().optional(),
  audioFeatures: AudioFeaturesSchema.optional(),
  embedding: z.array(z.number()).length(256).optional(),
  createdAt: z.date(),
});

// Interaction Event Schema (from client)
export const InteractionEventSchema = z.object({
  trackId: z.string().uuid(),
  eventType: EventTypeSchema,
  eventValue: z.number().int().min(0).optional(),
  context: InteractionContextSchema.optional(),
  clientTs: z.string().datetime(),
});

// Recommendation Request Schema
export const RecommendationRequestSchema = z.object({
  context: InteractionContextSchema.optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

// User Profile Schema
export const UserProfileSchema = z.object({
  externalUserId: z.string().min(1).max(255),
  preferredGenres: z.array(z.string()).default([]),
  dislikedGenres: z.array(z.string()).default([]),
  lastActiveAt: z.date(),
  profileEmbedding: z.array(z.number()).length(256).optional(),
});

// Playlist Schema
export const PlaylistCreateSchema = z.object({
  name: z.string().min(1).max(255),
});

export const PlaylistUpdateSchema = z.object({
  name: z.string().min(1).max(255),
});

export const PlaylistAddTrackSchema = z.object({
  trackId: z.string().uuid(),
});

// Onboarding Schema
export const OnboardingPreferencesSchema = z.object({
  preferredGenres: z.array(z.string().min(1)).min(1).max(10),
});

// Export type inference helpers
export type InteractionEventInput = z.infer<typeof InteractionEventSchema>;
export type RecommendationRequestInput = z.infer<typeof RecommendationRequestSchema>;
export type PlaylistCreateInput = z.infer<typeof PlaylistCreateSchema>;
export type PlaylistUpdateInput = z.infer<typeof PlaylistUpdateSchema>;
export type OnboardingPreferencesInput = z.infer<typeof OnboardingPreferencesSchema>;
