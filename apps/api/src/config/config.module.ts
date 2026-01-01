import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { DatabaseService } from './database.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [DatabaseService, RedisService],
  exports: [DatabaseService, RedisService],
})
export class ConfigModule {}
