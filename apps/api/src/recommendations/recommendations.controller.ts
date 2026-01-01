import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/user.decorator';
import { RecommendationRequestSchema } from '@music-rec/shared';

@ApiTags('recommendations')
@Controller('recommendations')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class RecommendationsController {
  constructor(private recommendationsService: RecommendationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get personalized music recommendations' })
  async getRecommendations(
    @CurrentUser() user: AuthenticatedUser,
    @Query('mood') mood?: string,
    @Query('activity') activity?: string,
    @Query('timeBucket') timeBucket?: string,
    @Query('limit') limit?: string,
  ) {
    // Build context from query params
    const context = {
      mood: mood as any,
      activity: activity as any,
      timeBucket: timeBucket as any,
    };

    const request = {
      context: Object.values(context).some((v) => v) ? context : undefined,
      limit: limit ? parseInt(limit, 10) : 20,
    };

    // Validate with Zod
    const validated = RecommendationRequestSchema.parse(request);

    const recommendations = await this.recommendationsService.getRecommendations(
      user.externalUserId,
      validated,
    );

    return recommendations;
  }
}
