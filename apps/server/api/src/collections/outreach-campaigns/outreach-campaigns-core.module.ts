import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { Module } from '@nestjs/common';

/** Outreach campaign persistence only. Execution stays on CampaignModule. */
@Module({
  exports: [OutreachCampaignsService],
  providers: [OutreachCampaignsService],
})
export class OutreachCampaignsCoreModule {}
