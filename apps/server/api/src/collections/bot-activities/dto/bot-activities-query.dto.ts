import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { BotActivityStatus, ReplyBotType } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class BotActivitiesQueryDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Filter by reply bot config ID',
    required: false,
  })
  replyBotConfigId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Filter by monitored account ID',
    required: false,
  })
  monitoredAccountId?: string;

  @IsEnum(ReplyBotType)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by bot type',
    enum: ReplyBotType,
    enumName: 'ReplyBotType',
    required: false,
  })
  botType?: ReplyBotType;

  @IsEnum(BotActivityStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by activity status',
    enum: BotActivityStatus,
    enumName: 'BotActivityStatus',
    required: false,
  })
  status?: BotActivityStatus;

  @IsDateString()
  @IsOptional()
  @ApiProperty({
    description: 'Filter activities from this date',
    required: false,
  })
  fromDate?: string;

  @IsDateString()
  @IsOptional()
  @ApiProperty({
    description: 'Filter activities until this date',
    required: false,
  })
  toDate?: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  @ApiProperty({
    default: 20,
    description: 'Number of results per page',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  limit?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  @ApiProperty({
    default: 1,
    description: 'Page number',
    minimum: 1,
    required: false,
  })
  page?: number;
}
