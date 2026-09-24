import { CreateCampaignDto } from '@api/collections/campaigns/dto/create-campaign.dto';
import { PickType } from '@nestjs/swagger';

export class GenerateCampaignPlanDto extends PickType(CreateCampaignDto, [
  'brandId',
  'name',
  'idempotencyKey',
] as const) {}
