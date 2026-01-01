import { Module, Global } from '@nestjs/common';
import { RecommendationGateway } from './recommendation.gateway';
import { RecommendationsModule } from '../recommendations/recommendations.module';

@Global()
@Module({
  imports: [RecommendationsModule],
  providers: [RecommendationGateway],
  exports: [RecommendationGateway],
})
export class WebsocketModule {}
