import { CreateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import { CampaignStatus } from '@genfeedai/enums';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateOutreachCampaignDto extends PartialType(
  CreateOutreachCampaignDto,
) {
  @IsEnum(CampaignStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Campaign status',
    enum: CampaignStatus,
    enumName: 'CampaignStatus',
    required: false,
  })
  status?: CampaignStatus;
}
