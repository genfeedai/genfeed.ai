import { HealthController } from '@libs/health/health.controller';
import {
  HEALTH_CONTRIBUTOR,
  type HealthContributor,
} from '@libs/health/health-contributor.interface';
import { RedisModule } from '@libs/redis/redis.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@slack/config/config.module';
import { ConfigService } from '@slack/config/config.service';
import { SlackBotManager } from '@slack/services/slack-bot-manager.service';

@Module({
  controllers: [HealthController],
  imports: [
    SentryModule.forRoot(),
    ConfigModule,
    HttpModule,
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
  ],
  providers: [
    SlackBotManager,
    {
      inject: [SlackBotManager],
      provide: HEALTH_CONTRIBUTOR,
      useFactory: (manager: SlackBotManager): HealthContributor => ({
        getHealthDetails: () => ({ activeBots: manager.getActiveCount() }),
      }),
    },
  ],
})
export class AppModule {}
