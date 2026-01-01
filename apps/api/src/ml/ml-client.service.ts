import { Injectable, Logger } from '@nestjs/common';
import { InteractionContext } from '@music-rec/shared';

export type RerankResult = { trackId: string; score: number };

@Injectable()
export class MlClientService {
  private readonly logger = new Logger(MlClientService.name);
  private readonly baseUrl = process.env.ML_SERVICE_URL || 'http://ml:8000';
  private readonly enabled = (process.env.RECSYS_RERANKER_ENABLED || 'true').toLowerCase() === 'true';

  async health(): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { method: 'GET' });
      return await res.json();
    } catch (e) {
      return { status: 'unavailable' };
    }
  }

  async rerank(params: {
    externalUserId: string;
    candidateTrackIds: string[];
    context?: InteractionContext;
    recentSequence?: string[];
    interestGraph?: any;
    limit?: number;
  }): Promise<RerankResult[] | null> {
    if (!this.enabled) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800); // لا نسمح بتأخير كبير

    try {
      const res = await fetch(`${this.baseUrl}/rerank`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          externalUserId: params.externalUserId,
          candidateTrackIds: params.candidateTrackIds,
          context: params.context,
          recentSequence: params.recentSequence,
          interestGraph: params.interestGraph,
          limit: params.limit || 20,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const txt = await res.text();
        this.logger.warn(`ML rerank failed: ${res.status} ${txt}`);
        return null;
      }

      const data = await res.json();
      const list = (data?.tracks || []) as Array<{ trackId: string; score: number }>;
      return list;
    } catch (err: any) {
      this.logger.warn(`ML service unavailable: ${err?.message || String(err)}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
