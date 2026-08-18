/**
 * Outreach Campaigns Module
 * Manages marketing campaign configurations for proactive outreach.
 * Supports manual target addition, AI-powered discovery, and scheduled blasts.
 */

import { CampaignTargetsModule } from '@api/collections/campaign-targets/campaign-targets.module';
import { OutreachCampaignsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaigns.controller';
import { OutreachCampaignsCoreModule } from '@api/collections/outreach-campaigns/outreach-campaigns-core.module';
import { CampaignModule } from '@api/services/campaign/campaign.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [OutreachCampaignsController],
  exports: [OutreachCampaignsCoreModule],
  imports: [OutreachCampaignsCoreModule, CampaignModule, CampaignTargetsModule],
})
export class OutreachCampaignsModule {}
