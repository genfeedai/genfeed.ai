import { CreateCampaignTargetDto } from '@api/collections/campaign-targets/dto/create-campaign-target.dto';
import { CampaignSkipReason, CampaignTargetStatus } from '@genfeedai/enums';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateCampaignTargetDto extends PartialType(
  CreateCampaignTargetDto,
) {
  @IsEnum(CampaignTargetStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Status of the target',
    enum: CampaignTargetStatus,
    enumName: 'CampaignTargetStatus',
    required: false,
  })
  status?: CampaignTargetStatus;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Reply text that was posted',
    required: false,
  })
  replyText?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'External ID of the posted reply',
    required: false,
  })
  replyExternalId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'URL of the posted reply',
    required: false,
  })
  replyUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Error message if processing failed',
    required: false,
  })
  errorMessage?: string;

  @IsEnum(CampaignSkipReason)
  @IsOptional()
  @ApiProperty({
    description: 'Reason why the target was skipped',
    enum: CampaignSkipReason,
    enumName: 'CampaignSkipReason',
    required: false,
  })
  skipReason?: CampaignSkipReason;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Number of retry attempts',
    required: false,
  })
  retryCount?: number;
}
