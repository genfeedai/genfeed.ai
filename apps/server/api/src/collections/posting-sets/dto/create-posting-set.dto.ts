import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePostingSetDto {
  @ApiProperty({ description: 'Display label', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @ApiPropertyOptional({ maxLength: 1_000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiProperty({
    description: 'Reusable channel targets for this posting set',
    type: 'array',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsObject({ each: true })
  @Type(() => Object)
  targets!: Record<string, unknown>[];
}
