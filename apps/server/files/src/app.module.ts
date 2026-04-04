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
        const redisUrl = configService.get('REDIS_URL');
        let host = 'localhost';
        let port = 6379;
        let password: string | undefined;

        try {
          const parsed = new URL(redisUrl || 'redis://localhost:6379');
          host = parsed.hostname || host;
          port = parsed.port ? Number(parsed.port) : port;
          password = parsed.password || configService.get('REDIS_PASSWORD');
        } catch {
          const withoutScheme =
            redisUrl?.replace(/^.*:\/\//, '') || 'localhost:6379';
          const [parsedHost, parsedPort] = withoutScheme.split(':');
          host = parsedHost || host;
          port = parsedPort ? Number(parsedPort) : port;
          password = configService.get('REDIS_PASSWORD');
        }

        return {
          connection: {
            host,
            port,
            ...(password && { password }),
            connectTimeout: 3000,
            enableOfflineQueue: false,
            enableReadyCheck: false,
            lazyConnect: true,
            maxRetriesPerRequest: 0,
            retryStrategy: () => null,
          },
        };
      },
    }),
  ],
})
export class AppModule {}
