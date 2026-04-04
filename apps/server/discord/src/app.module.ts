import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@discord/config/config.module';
import { ConfigService } from '@discord/config/config.service';
import { DiscordBotManager } from '@discord/services/discord-bot-manager.service';
import { HealthController } from '@discord/controllers/health.controller';
import { RedisModule } from '@libs/redis/redis.module';

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
  providers: [DiscordBotManager],
})
export class AppModule {}
