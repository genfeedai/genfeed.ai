import { CampaignsController } from '@api/collections/campaigns/controllers/campaigns.controller';
import { CampaignComparisonService } from '@api/collections/campaigns/services/campaign-comparison.service';
import { CampaignGenerationService } from '@api/collections/campaigns/services/campaign-generation.service';
import { CampaignLifecycleService } from '@api/collections/campaigns/services/campaign-lifecycle.service';
import { CampaignPaidActivationService } from '@api/collections/campaigns/services/campaign-paid-activation.service';
import { CampaignPerformanceService } from '@api/collections/campaigns/services/campaign-performance.service';
import { CampaignsService } from '@api/collections/campaigns/services/campaigns.service';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { PostLifecycleModule } from '@api/collections/posts/post-lifecycle.module';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AdsGatewayModule } from '@api/services/ads-gateway/ads-gateway.module';
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
    AdsGatewayModule,
  ],
  providers: [
    CampaignComparisonService,
    CampaignGenerationService,
    CampaignLifecycleService,
    CampaignPaidActivationService,
    CampaignPerformanceService,
    CampaignsService,
  ],
})
export class CampaignsModule {}
