import { SocialInboxModule } from '@api/collections/social-inbox/social-inbox.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronXReplyWatchService } from '@workers/crons/x-replies/cron.x-reply-watch.service';
import { SocialIntegrationsModule } from '@workers/services/social-integrations.module';

@Module({
  exports: [CronXReplyWatchService],
  imports: [
    CacheModule,
    NotificationsModule,
    forwardRef(() => SocialInboxModule),
    SocialIntegrationsModule,
  ],
  providers: [CronXReplyWatchService],
})
export class CronXRepliesModule {}
