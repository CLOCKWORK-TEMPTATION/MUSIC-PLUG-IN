import { Module } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';
import { InteractionsModule } from '../interactions/interactions.module';
import { UsersModule } from '../users/users.module';
import { MlModule } from '../ml/ml.module';
import { InterestGraphModule } from '../interest-graph/interest-graph.module';

@Module({
  imports: [InteractionsModule, UsersModule, MlModule, InterestGraphModule],
  providers: [RecommendationsService],
  controllers: [RecommendationsController],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
