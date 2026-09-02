import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateListeningTopicDto {
  @ApiProperty({ description: 'Operator-facing topic label', maxLength: 160 })
  @IsString()
  @MaxLength(160)
  label!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ maxItems: 25, minItems: 1, type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  keywords!: string[];

  @ApiPropertyOptional({ maxItems: 25, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  excludedKeywords?: string[];

  @ApiPropertyOptional({ maxItems: 10, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(35, { each: true })
  languages?: string[];

  @ApiProperty({ maxItems: 20, minItems: 1, type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsEntityId({ each: true })
  sourceIds!: string[];

  @ApiPropertyOptional({ default: 24, maximum: 720, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  freshnessHours?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
