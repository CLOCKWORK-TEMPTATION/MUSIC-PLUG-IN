import { Module } from '@nestjs/common';
import { InterestGraphService } from './interest-graph.service';

@Module({
  providers: [InterestGraphService],
  exports: [InterestGraphService],
})
export class InterestGraphModule {}
