import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { InteractionEventInput, Interaction, EventType } from '@music-rec/shared';

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger(InteractionsService.name);
  private readonly SKIP_DETECTION_WINDOW_SEC = 60;
  private readonly SKIP_THRESHOLD = 2;

  constructor(private db: DatabaseService) {}

  async recordInteraction(
    externalUserId: string,
    event: InteractionEventInput,
  ): Promise<{ interaction: Interaction; shouldRefreshRecommendations: boolean }> {
    // Insert interaction
    const row = await this.db.queryOne<any>(
      `INSERT INTO interactions (external_user_id, track_id, event_type, event_value, context, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [
        externalUserId,
        event.trackId,
        event.eventType,
        event.eventValue || null,
        event.context ? JSON.stringify(event.context) : null,
      ],
    );

    const interaction: Interaction = {
      id: row.id,
      externalUserId: row.external_user_id,
      trackId: row.track_id,
      eventType: row.event_type,
      eventValue: row.event_value,
      context: row.context,
      createdAt: row.created_at,
    };

    // Check if we should trigger recommendation refresh
    const shouldRefresh = await this.shouldRefreshRecommendations(externalUserId, event.eventType);

    if (shouldRefresh) {
      this.logger.log(
        `Skip threshold reached for user ${externalUserId}, triggering refresh`,
      );
    }

    return { interaction, shouldRefreshRecommendations: shouldRefresh };
  }

  private async shouldRefreshRecommendations(
    externalUserId: string,
    eventType: EventType,
  ): Promise<boolean> {
    // Only trigger on SKIP events
    if (eventType !== EventType.SKIP) {
      return false;
    }

    // Count recent SKIPs within the time window
    const result = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM interactions
       WHERE external_user_id = $1
         AND event_type = 'SKIP'
         AND created_at > NOW() - INTERVAL '${this.SKIP_DETECTION_WINDOW_SEC} seconds'`,
      [externalUserId],
    );

    const skipCount = parseInt(result?.count || '0', 10);
    return skipCount >= this.SKIP_THRESHOLD;
  }

  async getRecentInteractions(
    externalUserId: string,
    limit: number = 50,
  ): Promise<Interaction[]> {
    const rows = await this.db.query<any>(
      `SELECT * FROM interactions
       WHERE external_user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [externalUserId, limit],
    );

    return rows.map((row) => ({
      id: row.id,
      externalUserId: row.external_user_id,
      trackId: row.track_id,
      eventType: row.event_type,
      eventValue: row.event_value,
      context: row.context,
      createdAt: row.created_at,
    }));
  }

  async getRecentlySkippedTrackIds(
    externalUserId: string,
    hoursBack: number = 24,
    limit: number = 20,
  ): Promise<string[]> {
    const rows = await this.db.query<{ track_id: string }>(
      `SELECT DISTINCT track_id
       FROM interactions
       WHERE external_user_id = $1
         AND event_type = 'SKIP'
         AND created_at > NOW() - INTERVAL '${hoursBack} hours'
       ORDER BY created_at DESC
       LIMIT $2`,
      [externalUserId, limit],
    );

    return rows.map((row) => row.track_id);
  }

  async getUserInteractionStats(externalUserId: string): Promise<{
    totalInteractions: number;
    likeCount: number;
    skipCount: number;
    playCount: number;
  }> {
    const result = await this.db.queryOne<any>(
      `SELECT
         COUNT(*) as total_interactions,
         COUNT(CASE WHEN event_type = 'LIKE' THEN 1 END) as like_count,
         COUNT(CASE WHEN event_type = 'SKIP' THEN 1 END) as skip_count,
         COUNT(CASE WHEN event_type = 'PLAY' THEN 1 END) as play_count
       FROM interactions
       WHERE external_user_id = $1`,
      [externalUserId],
    );

    return {
      totalInteractions: parseInt(result?.total_interactions || '0', 10),
      likeCount: parseInt(result?.like_count || '0', 10),
      skipCount: parseInt(result?.skip_count || '0', 10),
      playCount: parseInt(result?.play_count || '0', 10),
    };
  }
}
