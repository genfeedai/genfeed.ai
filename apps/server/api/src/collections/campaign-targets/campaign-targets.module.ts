/**
 * Campaign Targets Module
 * Manages individual targets for marketing campaigns.
 * Tracks status, reply content, and processing metadata.
 */
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [CampaignTargetsService],
  imports: [],
  providers: [CampaignTargetsService],
})
export class CampaignTargetsModule {}
