import { Module } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';
import { InteractionsModule } from '../interactions/interactions.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [InteractionsModule, UsersModule],
  providers: [RecommendationsService],
  controllers: [RecommendationsController],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
