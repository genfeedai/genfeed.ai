import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import { SocialReplyCampaignController } from '@api/collections/social-inbox/controllers/social-reply-campaign.controller';
import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { SocialInboxActionService } from '@api/collections/social-inbox/services/social-inbox-action.service';
import { SocialInboxIngestionService } from '@api/collections/social-inbox/services/social-inbox-ingestion.service';
import { SocialInboxQueryService } from '@api/collections/social-inbox/services/social-inbox-query.service';
import { SocialInboxRealtimeService } from '@api/collections/social-inbox/services/social-inbox-realtime.service';
import { SocialInboxSyncWorkflowService } from '@api/collections/social-inbox/services/social-inbox-sync-workflow.service';
import { SocialReplyCampaignService } from '@api/collections/social-inbox/services/social-reply-campaign.service';
import { SocialReplyCampaignDispatchService } from '@api/collections/social-inbox/services/social-reply-campaign-dispatch.service';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SocialInboxController, SocialReplyCampaignController],
  exports: [SocialInboxService, SocialReplyCampaignDispatchService],
  imports: [
    InstagramModule,
    LinkedInModule,
    NotificationsPublisherModule,
    QueuesModule,
    TwitterModule,
    WorkflowsCoreModule,
    YoutubeModule,
  ],
  providers: [
    SocialInboxActionService,
    SocialInboxIngestionService,
    SocialInboxQueryService,
    SocialInboxRealtimeService,
    SocialInboxService,
    SocialInboxSyncWorkflowService,
    SocialReplyCampaignDispatchService,
    SocialReplyCampaignService,
  ],
})
export class SocialInboxModule {}
