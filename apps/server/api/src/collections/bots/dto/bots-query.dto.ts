import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { BotCategory, BotPlatform, BotStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class BotsQueryDto extends BaseQueryDto {
  @IsString()
  @IsOptional()
  @IsIn(['organization', 'brand', 'user'])
  @ApiProperty({
    description: 'Scope to filter bots by ownership',
    enum: ['organization', 'brand', 'user'],
    required: false,
  })
  scope?: 'organization' | 'brand' | 'user';

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ description: 'Organization ID filter', required: false })
  organization?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ description: 'Brand ID filter', required: false })
  brand?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ description: 'User ID filter', required: false })
  user?: string;

  @IsEnum(BotPlatform)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by platform',
    enum: BotPlatform,
    enumName: 'BotPlatform',
    required: false,
  })
  platform?: BotPlatform;

  @IsEnum(BotCategory)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by bot category',
    enum: BotCategory,
    enumName: 'BotCategory',
    required: false,
  })
  category?: BotCategory;

  @ApiProperty({
    description:
      'Filter by bot status using repeated query keys (e.g., ?status=active&status=paused).',
    enum: BotStatus,
    enumName: 'BotStatus',
    isArray: true,
    required: false,
  })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    return [value];
  })
  @IsOptional()
  @IsArray()
  @IsEnum(BotStatus, { each: true })
  status?: BotStatus[];
}
