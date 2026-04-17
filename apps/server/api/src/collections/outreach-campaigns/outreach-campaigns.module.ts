/**
 * Outreach Campaigns Module
 * Manages marketing campaign configurations for proactive outreach.
 * Supports manual target addition, AI-powered discovery, and scheduled blasts.
 */

import { CampaignTargetsModule } from '@api/collections/campaign-targets/campaign-targets.module';
import { OutreachCampaignsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaigns.controller';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignModule } from '@api/services/campaign/campaign.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [OutreachCampaignsController],
  exports: [OutreachCampaignsService],
  imports: [
    forwardRef(() => CampaignModule),
    forwardRef(() => CampaignTargetsModule),
  ],
  providers: [OutreachCampaignsService],
})
export class OutreachCampaignsModule {}
