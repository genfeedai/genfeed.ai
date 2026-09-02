import { CampaignsController } from '@api/collections/campaigns/controllers/campaigns.controller';
import { CampaignsService } from '@api/collections/campaigns/services/campaigns.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [CampaignsController],
  exports: [CampaignsService],
  providers: [CampaignsService],
})
export class CampaignsModule {}
