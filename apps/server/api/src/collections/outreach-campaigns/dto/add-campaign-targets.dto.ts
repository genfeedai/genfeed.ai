import { CampaignTargetType } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

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
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Content URLs to add as targets (manual URL addition)',
    required: false,
    type: [String],
  })
  urls?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description:
      'Usernames to add as DM recipients (requires targetType: dm_recipient)',
    required: false,
    type: [String],
  })
  usernames?: string[];
}
