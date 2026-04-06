import { ConfigModule } from '@files/config/config.module';
import { ConfigService } from '@files/config/config.service';
import { ControllersModule } from '@files/controllers/controllers.module';
import { CronModule } from '@files/cron/cron.module';
import { ProcessorsModule } from '@files/processors/processors.module';
import { QueuesModule } from '@files/queues/queues.module';
import { ServicesModule } from '@files/services/services.module';
import { SharedModule } from '@files/shared/shared.module';
import { HealthModule } from '@libs/health/health.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { RedisModule } from '@libs/redis/redis.module';
import {
  buildBullMQConnection,
  parseRedisConnection,
} from '@libs/redis/redis-connection.utils';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    SharedModule,
    HealthModule,
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    QueuesModule,
    ProcessorsModule,
    ServicesModule,
    ControllersModule,
    CronModule,
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = parseRedisConnection(configService);
        return { connection: buildBullMQConnection(config) };
      },
    }),
  ],
})
export class AppModule {}
