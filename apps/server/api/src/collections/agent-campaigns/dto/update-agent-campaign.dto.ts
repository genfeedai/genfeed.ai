import { CreateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/create-agent-campaign.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateAgentCampaignDto extends PartialType(
  CreateAgentCampaignDto,
) {}
