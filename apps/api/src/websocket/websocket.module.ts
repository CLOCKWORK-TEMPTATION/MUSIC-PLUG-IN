import { Module } from '@nestjs/common';
import { RecommendationGateway } from './recommendation.gateway';
import { RecommendationsModule } from '../recommendations/recommendations.module';

@Module({
  imports: [RecommendationsModule],
  providers: [RecommendationGateway],
  exports: [RecommendationGateway],
})
export class WebsocketModule {}
