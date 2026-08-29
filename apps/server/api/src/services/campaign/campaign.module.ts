/**
 * Campaign Module
 *
 * Provides campaign-related services:
 * - CampaignDiscoveryService - AI-powered content discovery
 * - CampaignExecutorService - Target execution and reply posting
 */
import { CampaignTargetsModule } from '@api/collections/campaign-targets/campaign-targets.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { OutreachCampaignsCoreModule } from '@api/collections/outreach-campaigns/outreach-campaigns-core.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { Module } from '@nestjs/common';
import { CampaignDiscoveryService } from '@server/services/campaign/campaign-discovery.service';
import { CampaignExecutorService } from '@server/services/campaign/campaign-executor.service';
import { DmCampaignExecutorService } from '@server/services/campaign/dm-campaign-executor.service';

@Module({
  exports: [
    CampaignDiscoveryService,
    CampaignExecutorService,
    DmCampaignExecutorService,
  ],
  imports: [
    CampaignTargetsModule,
    OutreachCampaignsCoreModule,
    CredentialsCoreModule,
    ReplyBotModule,
    WorkflowsCoreModule,
  ],
  providers: [
    CampaignDiscoveryService,
    CampaignExecutorService,
    DmCampaignExecutorService,
  ],
})
export class CampaignModule {}
