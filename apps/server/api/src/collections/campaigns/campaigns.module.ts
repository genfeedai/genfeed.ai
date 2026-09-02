import { CampaignsController } from '@api/collections/campaigns/controllers/campaigns.controller';
import { CampaignGenerationService } from '@api/collections/campaigns/services/campaign-generation.service';
import { CampaignLifecycleService } from '@api/collections/campaigns/services/campaign-lifecycle.service';
import { CampaignsService } from '@api/collections/campaigns/services/campaigns.service';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { PostLifecycleModule } from '@api/collections/posts/post-lifecycle.module';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [CampaignsController],
  exports: [CampaignsService],
  imports: [
    ContentIntelligenceModule,
    PostGroupsModule,
    PostLifecycleModule,
    PublishApprovalsModule,
    QueuesModule,
  ],
  providers: [
    CampaignGenerationService,
    CampaignLifecycleService,
    CampaignsService,
  ],
})
export class CampaignsModule {}
