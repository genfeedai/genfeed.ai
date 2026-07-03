/**
 * Campaign Module
 *
 * Provides campaign-related services:
 * - CampaignDiscoveryService - AI-powered content discovery
 * - CampaignExecutorService - Target execution and reply posting
 */
import { CampaignTargetsModule } from '@api/collections/campaign-targets/campaign-targets.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { OutreachCampaignsModule } from '@api/collections/outreach-campaigns/outreach-campaigns.module';
import { SystemWorkflowProvenanceService } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { CampaignDiscoveryService } from '@api/services/campaign/campaign-discovery.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { DmCampaignExecutorService } from '@api/services/campaign/dm-campaign-executor.service';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [
    CampaignDiscoveryService,
    CampaignExecutorService,
    DmCampaignExecutorService,
  ],
  imports: [
    forwardRef(() => CampaignTargetsModule),
    forwardRef(() => OutreachCampaignsModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => ReplyBotModule),
  ],
  providers: [
    CampaignDiscoveryService,
    CampaignExecutorService,
    DmCampaignExecutorService,
    SystemWorkflowProvenanceService,
  ],
})
export class CampaignModule {}
