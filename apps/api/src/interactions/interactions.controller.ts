import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InteractionsService } from './interactions.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/user.decorator';
import { InteractionEventSchema, InteractionEventInput } from '@music-rec/shared';
import { RecommendationGateway } from '../websocket/recommendation.gateway';

@ApiTags('interactions')
@Controller('interactions')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class InteractionsController {
  constructor(
    private interactionsService: InteractionsService,
    private recommendationGateway: RecommendationGateway,
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
