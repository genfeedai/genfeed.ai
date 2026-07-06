import { SettingsModule } from '@api/collections/settings/settings.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { RedisModule } from '@libs/redis/redis.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [NotificationsPublisherService],
  imports: [
    forwardRef(() => NotificationsModule),
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    forwardRef(() => SettingsModule),
  ],
  providers: [NotificationsPublisherService],
})
export class NotificationsPublisherModule {}
