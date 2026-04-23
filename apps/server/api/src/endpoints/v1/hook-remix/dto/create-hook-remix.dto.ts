import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class CreateHookRemixDto {
  @ApiProperty({ description: 'YouTube video URL' })
  @IsUrl()
  @IsNotEmpty()
  youtubeUrl!: string;

  @ApiProperty({ description: 'CTA video ingredient ID' })
  @IsMongoId()
  @IsNotEmpty()
  ctaIngredientId!: string;

  @ApiProperty({ description: 'Brand ID' })
  @IsMongoId()
  @IsNotEmpty()
  brandId!: string;

  @ApiPropertyOptional({ default: 3, description: 'Hook duration in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  hookDurationSeconds?: number;

  @ApiPropertyOptional({ description: 'Label for the output ingredient' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ description: 'Description for the output ingredient' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateBatchHookRemixDto {
  @ApiProperty({ description: 'Array of YouTube video URLs' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUrl({}, { each: true })
  youtubeUrls!: string[];

  @ApiProperty({ description: 'CTA video ingredient ID' })
  @IsMongoId()
  @IsNotEmpty()
  ctaIngredientId!: string;

  @ApiProperty({ description: 'Brand ID' })
  @IsMongoId()
  @IsNotEmpty()
  brandId!: string;

  @ApiPropertyOptional({ default: 3, description: 'Hook duration in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  hookDurationSeconds?: number;

  @ApiPropertyOptional({ description: 'Label prefix for output ingredients' })
  @IsOptional()
  @IsString()
  labelPrefix?: string;
}
