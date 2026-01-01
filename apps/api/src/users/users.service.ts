import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { UserProfile } from '@music-rec/shared';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private db: DatabaseService) {}

  private parseVector(value: any): number[] | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    const inner = trimmed.replace(/^[\[]/, '').replace(/\]$/, '');
    if (!inner) return undefined;
    const parts = inner.split(',').map((s) => parseFloat(s.trim()));
    const nums = parts.filter((n) => Number.isFinite(n));
    return nums.length ? nums : undefined;
  }

  async findOrCreateProfile(externalUserId: string): Promise<UserProfile> {
    // Try to find existing profile
    const existing = await this.db.queryOne<any>(
      'SELECT * FROM user_profiles WHERE external_user_id = $1',
      [externalUserId],
    );

    if (existing) {
      return {
        externalUserId: existing.external_user_id,
        preferredGenres: existing.preferred_genres || [],
        dislikedGenres: existing.disliked_genres || [],
        lastActiveAt: existing.last_active_at,
        profileEmbedding: this.parseVector(existing.profile_embedding),
      };
    }

    // Create new profile
    const newProfile = await this.db.queryOne<any>(
      `INSERT INTO user_profiles (external_user_id, preferred_genres, disliked_genres, last_active_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [externalUserId, [], []],
    );

    this.logger.log(`Created new user profile for ${externalUserId}`);

    return {
      externalUserId: newProfile.external_user_id,
      preferredGenres: newProfile.preferred_genres || [],
      dislikedGenres: newProfile.disliked_genres || [],
      lastActiveAt: newProfile.last_active_at,
    };
  }

  async updatePreferences(
    externalUserId: string,
    preferredGenres?: string[],
    dislikedGenres?: string[],
  ): Promise<UserProfile> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (preferredGenres !== undefined) {
      updates.push(`preferred_genres = $${paramIndex++}`);
      params.push(preferredGenres);
    }

    if (dislikedGenres !== undefined) {
      updates.push(`disliked_genres = $${paramIndex++}`);
      params.push(dislikedGenres);
    }

    updates.push(`last_active_at = NOW()`);
    params.push(externalUserId);

    const query = `
      UPDATE user_profiles
      SET ${updates.join(', ')}
      WHERE external_user_id = $${paramIndex}
      RETURNING *
    `;

    const updated = await this.db.queryOne<any>(query, params);

    if (!updated) {
      // Profile doesn't exist, create it
      return this.findOrCreateProfile(externalUserId);
    }

    return {
      externalUserId: updated.external_user_id,
      preferredGenres: updated.preferred_genres || [],
      dislikedGenres: updated.disliked_genres || [],
      lastActiveAt: updated.last_active_at,
      profileEmbedding: this.parseVector(updated.profile_embedding),
    };
  }

  async updateLastActive(externalUserId: string): Promise<void> {
    await this.db.query(
      'UPDATE user_profiles SET last_active_at = NOW() WHERE external_user_id = $1',
      [externalUserId],
    );
  }

  async computeAndUpdateProfileEmbedding(externalUserId: string): Promise<void> {
    // Compute profile embedding as weighted average of liked/played tracks
    const query = `
      UPDATE user_profiles up
      SET profile_embedding = (
        SELECT AVG(t.embedding)::vector(256)
        FROM (
          SELECT i.track_id,
                 CASE
                   WHEN i.event_type = 'LIKE' THEN 2.0
                   WHEN i.event_type = 'PLAY' THEN 1.0
                   WHEN i.event_type = 'SKIP' THEN -0.5
                   ELSE 0.0
                 END as weight
          FROM interactions i
          WHERE i.external_user_id = $1
            AND i.event_type IN ('LIKE', 'PLAY', 'SKIP')
            AND i.created_at > NOW() - INTERVAL '90 days'
          ORDER BY i.created_at DESC
          LIMIT 50
        ) recent_interactions
        JOIN tracks t ON t.id = recent_interactions.track_id
        WHERE t.embedding IS NOT NULL
      )
      WHERE up.external_user_id = $1
        AND EXISTS (
          SELECT 1 FROM interactions i
          WHERE i.external_user_id = $1 LIMIT 1
        )
    `;

    await this.db.query(query, [externalUserId]);
    this.logger.debug(`Updated profile embedding for ${externalUserId}`);
  }
}
