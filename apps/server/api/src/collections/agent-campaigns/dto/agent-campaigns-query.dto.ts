import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  AGENT_CAMPAIGN_STATUSES,
  type AgentCampaignStatus,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class AgentCampaignsQueryDto extends BaseQueryDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Filter by the selected brand',
    required: false,
  })
  brandId?: string;

  @IsIn(AGENT_CAMPAIGN_STATUSES)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by campaign status',
    enum: AGENT_CAMPAIGN_STATUSES,
    required: false,
  })
  status?: AgentCampaignStatus;
}
