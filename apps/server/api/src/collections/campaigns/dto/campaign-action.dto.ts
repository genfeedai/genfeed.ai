import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ContentCampaignStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsEnum,
  IsOptional,
} from 'class-validator';

export const MAX_CAMPAIGN_POST_ASSIGNMENT = 200;

/**
 * Public mutations take arrays — there is no singular twin and no
 * `T | T[]` overload.
 */
export class CampaignPostsDto {
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_CAMPAIGN_POST_ASSIGNMENT)
  @IsEntityId({ each: true })
  @ApiProperty({ isArray: true, type: String })
  readonly postIds!: string[];
}

export class RestoreCampaignDto {
  @IsOptional()
  @IsEnum(ContentCampaignStatus)
  @ApiProperty({
    description: 'Status to restore into; defaults to draft',
    enum: ContentCampaignStatus,
    enumName: 'ContentCampaignStatus',
    required: false,
  })
  readonly status?: ContentCampaignStatus;
}
