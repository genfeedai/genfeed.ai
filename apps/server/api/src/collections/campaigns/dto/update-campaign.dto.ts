import { CreateCampaignDto } from '@api/collections/campaigns/dto/create-campaign.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}
