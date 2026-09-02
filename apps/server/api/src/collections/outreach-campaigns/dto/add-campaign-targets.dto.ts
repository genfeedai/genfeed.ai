import { CampaignTargetType } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export const ADD_CAMPAIGN_TARGETS_MAX_ITEMS = 100;

export class AddCampaignTargetsDto {
  @IsEnum(CampaignTargetType)
  @IsOptional()
  @ApiProperty({
    default: CampaignTargetType.TWEET,
    description:
      'Discriminator for how targets are added. Defaults to URL-based target detection. Use DM_RECIPIENT to add DM recipients by username.',
    enum: CampaignTargetType,
    enumName: 'CampaignTargetType',
    required: false,
  })
  targetType?: CampaignTargetType;

  @IsArray()
  @ArrayMaxSize(ADD_CAMPAIGN_TARGETS_MAX_ITEMS)
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: `Content URLs to add as targets (manual URL addition, max ${ADD_CAMPAIGN_TARGETS_MAX_ITEMS})`,
    maxItems: ADD_CAMPAIGN_TARGETS_MAX_ITEMS,
    required: false,
    type: [String],
  })
  urls?: string[];

  @IsArray()
  @ArrayMaxSize(ADD_CAMPAIGN_TARGETS_MAX_ITEMS)
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: `Usernames to add as DM recipients (requires targetType: dm_recipient, max ${ADD_CAMPAIGN_TARGETS_MAX_ITEMS})`,
    maxItems: ADD_CAMPAIGN_TARGETS_MAX_ITEMS,
    required: false,
    type: [String],
  })
  usernames?: string[];
}
