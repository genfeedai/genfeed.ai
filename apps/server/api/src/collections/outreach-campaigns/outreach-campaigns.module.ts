/**
 * Outreach Campaigns Module
 * Manages marketing campaign configurations for proactive outreach.
 * Supports manual target addition, AI-powered discovery, and scheduled blasts.
 */

import { CampaignTargetsModule } from '@api/collections/campaign-targets/campaign-targets.module';
import { OutreachCampaignTargetsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaign-targets.controller';
import { OutreachCampaignsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaigns.controller';
import { OutreachCampaignsCoreModule } from '@api/collections/outreach-campaigns/outreach-campaigns-core.module';
import { OutreachCampaignTargetOperationsService } from '@api/collections/outreach-campaigns/services/outreach-campaign-target-operations.service';
import { CampaignModule } from '@api/services/campaign/campaign.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [OutreachCampaignTargetsController, OutreachCampaignsController],
  exports: [OutreachCampaignsCoreModule],
  imports: [OutreachCampaignsCoreModule, CampaignModule, CampaignTargetsModule],
  providers: [OutreachCampaignTargetOperationsService],
})
export class OutreachCampaignsModule {}
