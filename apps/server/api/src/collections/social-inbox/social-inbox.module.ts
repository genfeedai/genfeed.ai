import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [SocialInboxController],
  exports: [SocialInboxService],
  imports: [
    forwardRef(() => InstagramModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => QueuesModule),
    forwardRef(() => WorkflowsModule),
    forwardRef(() => YoutubeModule),
  ],
  providers: [SocialInboxService],
})
export class SocialInboxModule {}
