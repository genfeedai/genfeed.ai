import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RedisModule } from '@libs/redis/redis.module';
import { EventsModule } from '@libs/events/events.module';
import { ConfigModule } from '@telegram/config/config.module';
import { ConfigService } from '@telegram/config/config.service';
import { TelegramBotManager } from '@telegram/services/telegram-bot-manager.service';
import { HealthController } from '@telegram/controllers/health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule,
    HttpModule,
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    EventsModule,
  ],
  providers: [TelegramBotManager],
})
export class AppModule {}
