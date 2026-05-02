import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { CredentialPlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class QueryContentPerformanceDto {
  @ApiProperty({ description: 'Filter by brand ID', required: false })
  @IsOptional()
  @IsEntityId()
  brand?: string;

  @ApiProperty({
    description: 'Filter by platform',
    enum: CredentialPlatform,
    required: false,
  })
  @IsOptional()
  @IsEnum(CredentialPlatform)
  platform?: CredentialPlatform;

  @ApiProperty({ description: 'Start date', required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ description: 'End date', required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Filter by optimization cycle number',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cycleNumber?: number;

  @ApiProperty({ description: 'Filter by generationId', required: false })
  @IsOptional()
  @IsString()
  generationId?: string;

  @ApiProperty({
    description: 'Max results (default 100, max 500)',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
