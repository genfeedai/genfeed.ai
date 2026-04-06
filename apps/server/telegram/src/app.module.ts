import { EventsModule } from '@libs/events/events.module';
import { RedisModule } from '@libs/redis/redis.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@telegram/config/config.module';
import { ConfigService } from '@telegram/config/config.service';
import { HealthController } from '@telegram/controllers/health.controller';
import { TelegramBotManager } from '@telegram/services/telegram-bot-manager.service';

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
