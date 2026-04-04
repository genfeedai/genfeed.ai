import { SettingsModule } from '@api/collections/settings/settings.module';
import { UsersModule } from '@api/collections/users/users.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { RedisModule } from '@libs/redis/redis.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [NotificationsPublisherService],
  imports: [
    NotificationsModule,
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    SettingsModule,
    forwardRef(() => UsersModule),
  ],
  providers: [NotificationsPublisherService],
})
export class NotificationsPublisherModule {}
