import { ConfigModule } from '@discord/config/config.module';
import { ConfigService } from '@discord/config/config.service';
import { HealthController } from '@discord/controllers/health.controller';
import { DiscordBotManager } from '@discord/services/discord-bot-manager.service';
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
  providers: [DiscordBotManager],
})
export class AppModule {}
