import { EngagementAction } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class BotEngagementSettingsDto {
  @IsArray()
  @IsEnum(EngagementAction, { each: true })
  @ArrayMinSize(1)
  @ApiProperty({
    description: 'Engagement actions the bot performs',
    enum: EngagementAction,
    enumName: 'EngagementAction',
    example: [EngagementAction.LIKE],
    type: [String],
  })
  actions!: EngagementAction[];

  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  @ApiProperty({
    default: 100,
    description: 'Maximum engagement actions per day',
    maximum: 1000,
    minimum: 1,
    required: false,
  })
  actionsPerDay?: number = 100;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @ApiProperty({
    default: 10,
    description: 'Maximum engagement actions per hour',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  actionsPerHour?: number = 10;

  @IsInt()
  @Min(5)
  @Max(300)
  @IsOptional()
  @ApiProperty({
    default: 30,
    description: 'Seconds to wait between actions',
    maximum: 300,
    minimum: 5,
    required: false,
  })
  delayBetweenActions?: number = 30;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Accounts excluded from engagement',
    required: false,
    type: [String],
  })
  excludeAccounts?: string[] = [];

  @IsInt()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    description: 'Only engage accounts below this follower count',
    minimum: 0,
    required: false,
  })
  maxFollowers?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    description: 'Only engage accounts above this follower count',
    minimum: 0,
    required: false,
  })
  minFollowers?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Only engage verified accounts',
    required: false,
  })
  onlyVerified?: boolean = false;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Accounts the bot targets for engagement',
    required: false,
    type: [String],
  })
  targetAccounts?: string[] = [];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Hashtags the bot targets for engagement',
    required: false,
    type: [String],
  })
  targetHashtags?: string[] = [];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Keywords the bot targets for engagement',
    required: false,
    type: [String],
  })
  targetKeywords?: string[] = [];
}
