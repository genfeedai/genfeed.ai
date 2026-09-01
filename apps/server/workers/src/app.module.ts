import { CacheModule } from '@api/services/cache/cache.module';
import { SharedModule } from '@api/shared/shared.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { RedisModule } from '@libs/redis/redis.module';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@workers/config/config.module';
import { ConfigService } from '@workers/config/config.service';
import { ProcessorsModule } from '@workers/processors/processors.module';
import { PlatformSchedulesModule } from '@workers/scheduling/platform-schedules.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    SentryModule.forRoot(),
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    CacheModule,
    SharedModule,
    EventEmitterModule.forRoot({
      delimiter: '.',
      ignoreErrors: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      wildcard: true,
    }),
    PrismaModule,
    ProcessorsModule,
    PlatformSchedulesModule,
  ],
})
export class AppModule {}
