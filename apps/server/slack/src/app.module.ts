import { RedisModule } from '@libs/redis/redis.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@slack/config/config.module';
import { ConfigService } from '@slack/config/config.service';
import { HealthController } from '@slack/controllers/health.controller';
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
  providers: [SlackBotManager],
})
export class AppModule {}
