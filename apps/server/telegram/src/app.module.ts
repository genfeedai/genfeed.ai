import { EventsModule } from '@libs/events/events.module';
import { HealthController } from '@libs/health/health.controller';
import {
  HEALTH_CONTRIBUTOR,
  type HealthContributor,
} from '@libs/health/health-contributor.interface';
import { RedisModule } from '@libs/redis/redis.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@telegram/config/config.module';
import { ConfigService } from '@telegram/config/config.service';
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
  providers: [
    TelegramBotManager,
    {
      inject: [TelegramBotManager],
      provide: HEALTH_CONTRIBUTOR,
      useFactory: (manager: TelegramBotManager): HealthContributor => ({
        getHealthDetails: () => ({ activeBots: manager.getActiveCount() }),
      }),
    },
  ],
})
export class AppModule {}
