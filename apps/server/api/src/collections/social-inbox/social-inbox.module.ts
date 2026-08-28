import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import { SocialReplyCampaignController } from '@api/collections/social-inbox/controllers/social-reply-campaign.controller';
import { SocialReplyCampaignService } from '@api/collections/social-inbox/services/social-reply-campaign.service';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { forwardRef, Module } from '@nestjs/common';
import { SocialInboxService } from '@server/collections/social-inbox/services/social-inbox.service';
import { SocialInboxActionService } from '@server/collections/social-inbox/services/social-inbox-action.service';
import { SocialInboxIngestionService } from '@server/collections/social-inbox/services/social-inbox-ingestion.service';
import { SocialInboxQueryService } from '@server/collections/social-inbox/services/social-inbox-query.service';
import { SocialInboxRealtimeService } from '@server/collections/social-inbox/services/social-inbox-realtime.service';
import { SocialReplyCampaignDispatchService } from '@server/collections/social-inbox/services/social-reply-campaign-dispatch.service';

@Module({
  controllers: [SocialInboxController, SocialReplyCampaignController],
  exports: [SocialInboxService, SocialReplyCampaignDispatchService],
  imports: [
    InstagramModule,
    LinkedInModule,
    NotificationsPublisherModule,
    QueuesModule,
    TwitterModule,
    forwardRef(() => WorkflowsModule),
    YoutubeModule,
  ],
  providers: [
    SocialInboxActionService,
    SocialInboxIngestionService,
    SocialInboxQueryService,
    SocialInboxRealtimeService,
    SocialInboxService,
    SocialReplyCampaignDispatchService,
    SocialReplyCampaignService,
  ],
})
export class SocialInboxModule {}
