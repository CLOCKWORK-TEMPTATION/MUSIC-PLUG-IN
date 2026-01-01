import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InteractionsService } from './interactions.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/user.decorator';
import { InteractionEventSchema, InteractionEventInput } from '@music-rec/shared';
import { RecommendationGateway } from '../websocket/recommendation.gateway';
import { InterestGraphService } from '../interest-graph/interest-graph.service';

@ApiTags('interactions')
@Controller('interactions')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class InteractionsController {
  constructor(
    private interactionsService: InteractionsService,
    private recommendationGateway: RecommendationGateway,
    private interestGraphService: InterestGraphService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Record a user interaction event' })
  async recordInteraction(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: InteractionEventInput,
  ) {
    // Validate with Zod
    const validated = InteractionEventSchema.parse(body);

    const { interaction, shouldRefreshRecommendations } =
      await this.interactionsService.recordInteraction(user.externalUserId, validated);

    // تحديث Interest Graph بشكل Best-effort (لا نكسر الطلب إذا فشل)
    const igEnabled =
      (process.env.RECSYS_INTEREST_GRAPH_ENABLED || 'true').toLowerCase() === 'true';
    if (igEnabled) {
      this.interestGraphService
        .refresh(user.externalUserId)
        .catch((e) => {
          // لوج فقط
          // eslint-disable-next-line no-console
          console.warn('InterestGraph refresh failed', e);
        });
    }

    // If skip threshold reached, trigger WebSocket update
    if (shouldRefreshRecommendations) {
      await this.recommendationGateway.triggerRecommendationRefresh(
        user.externalUserId,
        'skip_detected',
      );
    }

    return {
      success: true,
      interaction,
      refreshTriggered: shouldRefreshRecommendations,
    };
  }
}
