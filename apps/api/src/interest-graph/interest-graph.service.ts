import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';

/**
 * Interest Graph (Heuristic + Optional LLM enrichment)
 *
 * الهدف: تحويل تفاعلات المستخدم إلى "Graph" بسيط قابِل للاستخدام كـFeatures في
 * - Reranker
 * - Feature Store (Feast)
 * - Explainability (لاحقًا)
 */
@Injectable()
export class InterestGraphService {
  private readonly logger = new Logger(InterestGraphService.name);

  constructor(private db: DatabaseService) {}

  /**
   * يرجع graph من DB إن وُجد، وإلا يحسبه ويخزنه.
   */
  async getOrCompute(externalUserId: string): Promise<any | null> {
    const existing = await this.db.queryOne<any>(
      'SELECT graph FROM user_interest_graph WHERE external_user_id = $1',
      [externalUserId],
    );

    if (existing?.graph) {
      return existing.graph;
    }

    const computed = await this.compute(externalUserId);
    if (computed) {
      await this.upsert(externalUserId, computed);
    }
    return computed;
  }

  /**
   * إعادة حساب graph وتحديثه. تستخدم عند تغيّر سلوك المستخدم.
   */
  async refresh(externalUserId: string): Promise<any | null> {
    const computed = await this.compute(externalUserId);
    if (!computed) return null;

    await this.upsert(externalUserId, computed);
    return computed;
  }

  private async upsert(externalUserId: string, graph: any): Promise<void> {
    await this.db.query(
      `INSERT INTO user_interest_graph (external_user_id, graph, version)
       VALUES ($1, $2::jsonb, 1)
       ON CONFLICT (external_user_id)
       DO UPDATE SET graph = EXCLUDED.graph, version = user_interest_graph.version + 1, updated_at = NOW()`,
      [externalUserId, JSON.stringify(graph)],
    );
  }

  /**
   * يحسب graph من آخر 90 يوم (PLAY/LIKE/SKIP/DISLIKE).
   * - يطلع Top Artists + Top Genres بوزن normalized (0..1)
   * - يطلع قوائم avoid بناءً على DISLIKE/SKIP الثقيلة
   */
  private async compute(externalUserId: string): Promise<any | null> {
    const rows = await this.db.query<any>(
      `SELECT i.event_type, i.created_at, t.artist, t.genre
       FROM interactions i
       JOIN tracks t ON t.id = i.track_id
       WHERE i.external_user_id = $1
         AND i.created_at > NOW() - INTERVAL '90 days'
         AND i.event_type IN ('PLAY','LIKE','SKIP','DISLIKE')
       ORDER BY i.created_at DESC
       LIMIT 500`,
      [externalUserId],
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    const weights: Record<string, number> = {
      LIKE: 2.0,
      PLAY: 1.0,
      SKIP: -1.0,
      DISLIKE: -2.0,
    };

    const artistScore: Map<string, number> = new Map();
    const genreScore: Map<string, number> = new Map();

    for (const r of rows) {
      const w = weights[r.event_type] ?? 0;
      if (r.artist) artistScore.set(r.artist, (artistScore.get(r.artist) || 0) + w);
      if (r.genre) genreScore.set(r.genre, (genreScore.get(r.genre) || 0) + w);
    }

    const topArtists = this.normalizeTop(artistScore, 20);
    const topGenres = this.normalizeTop(genreScore, 20);

    const avoidArtists = this.normalizeTop(
      new Map([...artistScore.entries()].filter(([, v]) => v < 0).map(([k, v]) => [k, Math.abs(v)])),
      20,
    );

    const avoidGenres = this.normalizeTop(
      new Map([...genreScore.entries()].filter(([, v]) => v < 0).map(([k, v]) => [k, Math.abs(v)])),
      20,
    );

    const graph = {
      version: 1,
      generatedBy: 'heuristic',
      updatedAt: new Date().toISOString(),
      windowDays: 90,
      topArtists,
      topGenres,
      avoidArtists,
      avoidGenres,
    };

    // نقطة توسعة: LLM enrichment (اختياري)
    // - يمكن لاحقًا إرسال topArtists/topGenres مع metadata للـLLM ليقترح "اهتمامات" أعمق
    // - هنا نتركه متروكًا للتفعيل عبر env عند الربط الحقيقي

    return graph;
  }

  private normalizeTop(map: Map<string, number>, k: number): Record<string, number> {
    const sorted = [...map.entries()]
      .filter(([, v]) => Number.isFinite(v))
      .sort((a, b) => b[1] - a[1])
      .slice(0, k);

    const max = sorted.length ? Math.max(...sorted.map(([, v]) => v)) : 0;
    const out: Record<string, number> = {};
    for (const [key, val] of sorted) {
      if (!max || max <= 0) {
        out[key] = 0;
      } else {
        out[key] = Number((val / max).toFixed(4));
      }
    }
    return out;
  }
}
