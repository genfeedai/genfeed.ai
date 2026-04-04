import { BotLivestreamSettingsDto } from '@api/collections/bots/dto/bot-livestream-settings.dto';
import { BotSettingsDto } from '@api/collections/bots/dto/bot-settings.dto';
import { BotTargetDto } from '@api/collections/bots/dto/bot-target.dto';
import { BotCategory, BotPlatform, BotStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';

export class CreateBotDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Organization that owns the bot',
    required: false,
  })
  organization?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Brand the bot is scoped to',
    required: false,
  })
  brand?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'User that configured the bot',
    required: false,
  })
  user?: Types.ObjectId;

  @IsString()
  @MaxLength(120)
  @ApiProperty({
    description: 'Name of the bot',
    example: 'Genfeed Studio Assistant',
  })
  label!: string;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  @ApiProperty({
    description: 'Description of the bot purpose and behaviour',
    required: false,
  })
  description?: string;

  @IsEnum(BotCategory)
  @ApiProperty({
    description: 'Whether the bot participates in live chat or comments',
    enum: BotCategory,
    enumName: 'BotCategory',
  })
  category!: BotCategory;

  @IsArray()
  @IsEnum(BotPlatform, { each: true })
  @ApiProperty({
    description: 'Platforms where the bot is active',
    enum: BotPlatform,
    enumName: 'BotPlatform',
    example: [BotPlatform.TWITTER],
    type: [String],
  })
  platforms!: BotPlatform[];

  @ValidateNested({ each: true })
  @Type(() => BotTargetDto)
  @IsArray()
  @IsOptional()
  @ApiProperty({
    description: 'Specific accounts/channels targeted by the bot',
    required: false,
    type: [BotTargetDto],
  })
  targets?: BotTargetDto[];

  @IsEnum(BotStatus)
  @IsOptional()
  @ApiProperty({
    default: BotStatus.ACTIVE,
    description: 'Lifecycle status of the bot',
    enum: BotStatus,
    enumName: 'BotStatus',
    required: false,
  })
  status?: BotStatus = BotStatus.ACTIVE;

  @ValidateNested()
  @Type(() => BotSettingsDto)
  @IsOptional()
  @ApiProperty({
    description: 'Engagement and automation settings',
    required: false,
    type: BotSettingsDto,
  })
  settings?: BotSettingsDto;

  @ValidateNested()
  @Type(() => BotLivestreamSettingsDto)
  @IsOptional()
  @ApiProperty({
    description: 'Livestream scheduling and context settings',
    required: false,
    type: BotLivestreamSettingsDto,
  })
  livestreamSettings?: BotLivestreamSettingsDto;
}
