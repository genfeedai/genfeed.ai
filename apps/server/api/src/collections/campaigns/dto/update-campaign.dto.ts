import { CreateCampaignDto } from '@api/collections/campaigns/dto/create-campaign.dto';
import { OmitType, PartialType } from '@nestjs/swagger';

/**
 * `status` is not client-writable here: archive, restore, pause, resume and
 * complete go through the lifecycle endpoints, which check the state machine
 * and coordinate the campaign's posts (#10403).
 */
export class UpdateCampaignDto extends PartialType(
  OmitType(CreateCampaignDto, ['idempotencyKey', 'status'] as const),
  { skipNullProperties: false },
) {}
