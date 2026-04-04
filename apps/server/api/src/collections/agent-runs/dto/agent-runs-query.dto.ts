import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import {
  AGENT_RUN_SORT_MODES,
  AGENT_RUN_TIME_RANGES,
  DEFAULT_AGENT_RUN_SORT_MODE,
  DEFAULT_AGENT_RUN_TIME_RANGE,
} from '@genfeedai/types';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { Types } from 'mongoose';

export class AgentRunsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Exclude pending and running runs from the response',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return false;
    }
    return value === true || value === 'true' || value === '1';
  })
  @IsBoolean()
  historyOnly: boolean = false;

  @ApiProperty({
    description: 'Filter by requested or actual model',
    required: false,
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({
    description: 'Search label, objective, and routing metadata',
    required: false,
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({
    description: 'Filter by routing policy metadata',
    required: false,
  })
  @IsOptional()
  @IsString()
  routingPolicy?: string;

  @ApiProperty({
    default: DEFAULT_AGENT_RUN_SORT_MODE,
    enum: AGENT_RUN_SORT_MODES,
    required: false,
  })
  @IsOptional()
  @IsIn(AGENT_RUN_SORT_MODES)
  sortMode: (typeof AGENT_RUN_SORT_MODES)[number] = DEFAULT_AGENT_RUN_SORT_MODE;

  @ApiProperty({
    description: 'Filter by run status',
    required: false,
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    description: 'Filter by agent strategy id',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  strategy?: string | Types.ObjectId;

  @ApiProperty({
    description: 'Filter by trigger',
    required: false,
  })
  @IsOptional()
  @IsString()
  trigger?: string;

  @ApiProperty({
    description: 'Filter by web search flag',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return value === true || value === 'true' || value === '1';
  })
  @IsBoolean()
  webSearchEnabled?: boolean;
}

export class AgentRunStatsQueryDto {
  @ApiProperty({
    default: DEFAULT_AGENT_RUN_TIME_RANGE,
    enum: AGENT_RUN_TIME_RANGES,
    required: false,
  })
  @IsOptional()
  @Type(() => String)
  @IsIn(AGENT_RUN_TIME_RANGES)
  timeRange: (typeof AGENT_RUN_TIME_RANGES)[number] =
    DEFAULT_AGENT_RUN_TIME_RANGE;
}
