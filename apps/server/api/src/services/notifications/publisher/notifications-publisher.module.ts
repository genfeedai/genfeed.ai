import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { RedisModule } from '@libs/redis/redis.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [NotificationsPublisherService],
  imports: [
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
  ],
  providers: [NotificationsPublisherService],
})
export class NotificationsPublisherModule {}
