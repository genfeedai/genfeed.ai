import { ConfigModule } from '@discord/config/config.module';
import { ConfigService } from '@discord/config/config.service';
import { DiscordBotManager } from '@discord/services/discord-bot-manager.service';
import { HealthController } from '@libs/health/health.controller';
import {
  HEALTH_CONTRIBUTOR,
  type HealthContributor,
} from '@libs/health/health-contributor.interface';
import { RedisModule } from '@libs/redis/redis.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';

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
    DiscordBotManager,
    {
      inject: [DiscordBotManager],
      provide: HEALTH_CONTRIBUTOR,
      useFactory: (manager: DiscordBotManager): HealthContributor => ({
        getHealthDetails: () => ({ activeBots: manager.getActiveCount() }),
      }),
    },
  ],
})
export class AppModule {}
