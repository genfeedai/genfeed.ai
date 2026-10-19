import { PageQueryDto } from '@api/helpers/dto/page-query.dto';
import { CampaignTargetStatus } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class CampaignTargetsQueryDto extends PageQueryDto {
  @ApiProperty({
    description: 'Filter targets by status',
    enum: CampaignTargetStatus,
    enumName: 'CampaignTargetStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(CampaignTargetStatus)
  status?: CampaignTargetStatus;
}
