import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { RedisService } from '../config/redis.service';
import { InteractionsService } from '../interactions/interactions.service';
import { UsersService } from '../users/users.service';
import { MlClientService } from '../ml/ml-client.service';
import { InterestGraphService } from '../interest-graph/interest-graph.service';
import {
  Track,
  InteractionContext,
  RecommendationRequest,
  RecommendationResponse,
} from '@music-rec/shared';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private readonly CACHE_TTL_SEC = 300; // 5 minutes
  private readonly MAX_SAME_ARTIST_CONSECUTIVE = 3;

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
    private interactionsService: InteractionsService,
    private usersService: UsersService,
    private mlClient: MlClientService,
    private interestGraphService: InterestGraphService,
  ) {}

  async getRecommendations(
    externalUserId: string,
    request: RecommendationRequest,
  ): Promise<RecommendationResponse> {
    const limit = request.limit || 20;
    const context = request.context;

    // Check cache first
    const cacheKey = `recommendations:${externalUserId}:${JSON.stringify(context)}`;
    const cached = await this.redis.get<RecommendationResponse>(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for user ${externalUserId}`);
      return cached;
    }

    // Get user profile
    const profile = await this.usersService.findOrCreateProfile(externalUserId);
    const stats = await this.interactionsService.getUserInteractionStats(externalUserId);

    let tracks: Track[];

    if (stats.totalInteractions === 0 || (profile.preferredGenres.length === 0 && !profile.profileEmbedding)) {
      // Cold start: New user or no preferences
      this.logger.log(`Cold start for user ${externalUserId}`);
      tracks = await this.coldStartRecommendations(profile.preferredGenres, limit, context);
    } else {
      // Personalized recommendations
      tracks = await this.personalizedRecommendations(externalUserId, profile, limit, context);
    }

    // Apply diversity rules
    tracks = this.applyDiversityRules(tracks);

    const response: RecommendationResponse = {
      tracks: tracks.slice(0, limit),
      context,
      generatedAt: new Date(),
    };

    // Cache the result
    await this.redis.set(cacheKey, response, this.CACHE_TTL_SEC);

    return response;
  }

  private async coldStartRecommendations(
    preferredGenres: string[],
    limit: number,
    context?: InteractionContext,
  ): Promise<Track[]> {
    // If user has preferred genres, use them
    if (preferredGenres.length > 0) {
      const rows = await this.db.query<any>(
        `SELECT t.*, pt.popularity_score
         FROM popular_tracks pt
         JOIN tracks t ON t.id = pt.id
         WHERE t.genre = ANY($1)
         ORDER BY pt.popularity_score DESC
         LIMIT $2`,
        [preferredGenres, limit * 2],
      );

      return this.mapRowsToTracks(rows);
    }

    // Fallback: Return most popular tracks across all genres
    const rows = await this.db.query<any>(
      `SELECT t.*, pt.popularity_score
       FROM popular_tracks pt
       JOIN tracks t ON t.id = pt.id
       ORDER BY pt.popularity_score DESC
       LIMIT $1`,
      [limit * 2],
    );

    return this.mapRowsToTracks(rows);
  }

  private async personalizedRecommendations(
    externalUserId: string,
    profile: any,
    limit: number,
    context?: InteractionContext,
  ): Promise<Track[]> {
    // First, update user profile embedding
    await this.usersService.computeAndUpdateProfileEmbedding(externalUserId);

    // Get recently skipped tracks to exclude
    const excludeTrackIds = await this.interactionsService.getRecentlySkippedTrackIds(
      externalUserId,
      24,
      20,
    );

    // Fetch updated profile
    const updatedProfile = await this.usersService.findOrCreateProfile(externalUserId);

    // Use pgvector similarity search if embedding exists
    if (updatedProfile.profileEmbedding) {
      const embeddingStr = `[${updatedProfile.profileEmbedding.join(',')}]`;

      const rows = await this.db.query<any>(
        `SELECT t.*,
                1 - (t.embedding <=> $1::vector) as similarity_score
         FROM tracks t
         WHERE t.embedding IS NOT NULL
           AND t.id NOT IN (${excludeTrackIds.length > 0 ? excludeTrackIds.map((_, i) => `$${i + 2}`).join(',') : 'SELECT NULL WHERE FALSE'})
         ORDER BY t.embedding <=> $1::vector
         LIMIT $${excludeTrackIds.length + 2}`,
        [embeddingStr, ...excludeTrackIds, limit * 3],
      );

      let tracks = this.mapRowsToTracks(rows);

<<<<<<< HEAD
      // استبعاد الأنواع التي وضعها المستخدم ضمن dislikedGenres
      if (profile?.dislikedGenres?.length) {
        tracks = tracks.filter((t) => !profile.dislikedGenres.includes(t.genre));
      }

=======
>>>>>>> 1b6bdb2805c388458020f1d6349167d0395585e6
      // Apply context-based ranking
      if (context) {
        tracks = this.rankByContext(tracks, context);
      }

<<<<<<< HEAD
      // Interest Graph (Heuristic الآن، LLM لاحقًا)
      const interestGraphEnabled =
        (process.env.RECSYS_INTEREST_GRAPH_ENABLED || 'true').toLowerCase() === 'true';
      const interestGraph = interestGraphEnabled
        ? await this.interestGraphService.getOrCompute(externalUserId)
        : null;

      if (interestGraph) {
        tracks = this.applyInterestGraphFilters(tracks, interestGraph);
      }

      // Sequential Reranker (ML service)
      const recentSequence = await this.getRecentTrackSequenceFromDb(externalUserId, 50);
      const reranked = await this.mlClient.rerank({
        externalUserId,
        candidateTrackIds: tracks.map((t) => t.id),
        context,
        recentSequence,
        interestGraph,
        limit: Math.min(limit * 3, 50),
      });

      if (reranked?.length) {
        tracks = this.reorderTracksByRerank(tracks, reranked);
      }

=======
>>>>>>> 1b6bdb2805c388458020f1d6349167d0395585e6
      return tracks;
    }

    // Fallback: Genre-based recommendations
    return this.genreBasedRecommendations(
      updatedProfile.preferredGenres,
      excludeTrackIds,
      limit,
    );
  }

  private async genreBasedRecommendations(
    preferredGenres: string[],
    excludeTrackIds: string[],
    limit: number,
  ): Promise<Track[]> {
    if (preferredGenres.length === 0) {
      return [];
    }

    const rows = await this.db.query<any>(
      `SELECT t.*, pt.popularity_score
       FROM popular_tracks pt
       JOIN tracks t ON t.id = pt.id
       WHERE t.genre = ANY($1)
         AND t.id NOT IN (${excludeTrackIds.length > 0 ? excludeTrackIds.map((_, i) => `$${i + 2}`).join(',') : 'SELECT NULL WHERE FALSE'})
       ORDER BY pt.popularity_score DESC
       LIMIT $${excludeTrackIds.length + 2}`,
      [preferredGenres, ...excludeTrackIds, limit * 2],
    );

    return this.mapRowsToTracks(rows);
  }

  private rankByContext(tracks: Track[], context: InteractionContext): Track[] {
    return tracks.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Context-based scoring
      if (context.activity === 'EXERCISE' && a.audioFeatures?.energy) {
        scoreA += a.audioFeatures.energy * 10;
      }
      if (context.activity === 'EXERCISE' && b.audioFeatures?.energy) {
        scoreB += b.audioFeatures.energy * 10;
      }

      if (context.mood === 'CALM' && a.audioFeatures?.energy) {
        scoreA += (1 - a.audioFeatures.energy) * 10;
      }
      if (context.mood === 'CALM' && b.audioFeatures?.energy) {
        scoreB += (1 - b.audioFeatures.energy) * 10;
      }

      if (context.mood === 'ENERGETIC' && a.audioFeatures?.energy) {
        scoreA += a.audioFeatures.energy * 10;
      }
      if (context.mood === 'ENERGETIC' && b.audioFeatures?.energy) {
        scoreB += b.audioFeatures.energy * 10;
      }

      if (context.mood === 'HAPPY' && a.audioFeatures?.valence) {
        scoreA += a.audioFeatures.valence * 10;
      }
      if (context.mood === 'HAPPY' && b.audioFeatures?.valence) {
        scoreB += b.audioFeatures.valence * 10;
      }

      if (context.mood === 'SAD' && a.audioFeatures?.valence) {
        scoreA += (1 - a.audioFeatures.valence) * 10;
      }
      if (context.mood === 'SAD' && b.audioFeatures?.valence) {
        scoreB += (1 - b.audioFeatures.valence) * 10;
      }

      if (context.activity === 'RELAX' && a.audioFeatures?.energy) {
        scoreA += (1 - a.audioFeatures.energy) * 8;
      }
      if (context.activity === 'RELAX' && b.audioFeatures?.energy) {
        scoreB += (1 - b.audioFeatures.energy) * 8;
      }

      if (context.activity === 'PARTY' && a.audioFeatures?.danceability) {
        scoreA += a.audioFeatures.danceability * 10;
      }
      if (context.activity === 'PARTY' && b.audioFeatures?.danceability) {
        scoreB += b.audioFeatures.danceability * 10;
      }

      return scoreB - scoreA;
    });
  }

  private applyDiversityRules(tracks: Track[]): Track[] {
    const result: Track[] = [];
    const artistCount: Map<string, number> = new Map();

    for (const track of tracks) {
      const consecutiveCount = this.getConsecutiveArtistCount(result, track.artist);

      if (consecutiveCount < this.MAX_SAME_ARTIST_CONSECUTIVE) {
        result.push(track);
        artistCount.set(track.artist, (artistCount.get(track.artist) || 0) + 1);
      }
    }

    return result;
  }

  private getConsecutiveArtistCount(tracks: Track[], artist: string): number {
    let count = 0;
    for (let i = tracks.length - 1; i >= 0; i--) {
      if (tracks[i].artist === artist) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  private mapRowsToTracks(rows: any[]): Track[] {
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      genre: row.genre,
      durationSec: row.duration_sec,
      externalUrl: row.external_url,
      previewUrl: row.preview_url,
      audioFeatures: row.audio_features,
      embedding: row.embedding,
      createdAt: row.created_at,
    }));
  }

<<<<<<< HEAD
  private applyInterestGraphFilters(tracks: Track[], interestGraph: any): Track[] {
    const avoidArtists: Record<string, number> = interestGraph?.avoidArtists || {};
    const avoidGenres: Record<string, number> = interestGraph?.avoidGenres || {};

    // حد عملي: أي وزن >= 0.6 يعني تجنّب قوي
    const AVOID_THRESHOLD = 0.6;
    return tracks.filter((t) => {
      const a = avoidArtists[t.artist];
      if (typeof a === 'number' && a >= AVOID_THRESHOLD) return false;
      const g = avoidGenres[t.genre];
      if (typeof g === 'number' && g >= AVOID_THRESHOLD) return false;
      return true;
    });
  }

  private async getRecentTrackSequenceFromDb(
    externalUserId: string,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.db.query<{ track_id: string }>(
      `SELECT track_id
       FROM interactions
       WHERE external_user_id = $1
         AND event_type IN ('PLAY','LIKE','SKIP')
       ORDER BY created_at DESC
       LIMIT $2`,
      [externalUserId, limit],
    );

    // oldest -> newest
    return rows.map((r) => r.track_id).reverse();
  }

  private reorderTracksByRerank(
    tracks: Track[],
    reranked: Array<{ trackId: string; score: number }>,
  ): Track[] {
    const map = new Map(tracks.map((t) => [t.id, t] as const));
    const ordered: Track[] = [];
    const seen = new Set<string>();

    for (const item of reranked) {
      const t = map.get(item.trackId);
      if (t && !seen.has(t.id)) {
        ordered.push(t);
        seen.add(t.id);
      }
    }

    // Append leftovers (يحافظ على ترتيب الـcandidate الأصلي)
    for (const t of tracks) {
      if (!seen.has(t.id)) ordered.push(t);
    }

    return ordered;
  }

=======
>>>>>>> 1b6bdb2805c388458020f1d6349167d0395585e6
  async invalidateCache(externalUserId: string): Promise<void> {
    await this.redis.flushPattern(`recommendations:${externalUserId}:*`);
    this.logger.debug(`Cache invalidated for user ${externalUserId}`);
  }
}
