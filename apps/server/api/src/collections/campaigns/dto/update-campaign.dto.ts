import { CreateCampaignDto } from '@api/collections/campaigns/dto/create-campaign.dto';
import { OmitType, PartialType } from '@nestjs/swagger';

export class UpdateCampaignDto extends PartialType(
  OmitType(CreateCampaignDto, ['idempotencyKey'] as const),
) {}
