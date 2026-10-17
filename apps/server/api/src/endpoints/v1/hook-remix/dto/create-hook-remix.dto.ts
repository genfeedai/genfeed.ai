import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

/** Hosts yt-dlp may be pointed at; it would fetch any other host it is given. */
const YOUTUBE_HOSTS = [
  'youtu.be',
  'youtube.com',
  'm.youtube.com',
  'www.youtube.com',
];

export class CreateHookRemixDto {
  @ApiProperty({ description: 'YouTube video URL' })
  @IsUrl({
    host_whitelist: YOUTUBE_HOSTS,
    protocols: ['https'],
    require_protocol: true,
  })
  @IsNotEmpty()
  youtubeUrl!: string;

  @ApiProperty({ description: 'CTA video ingredient ID' })
  @IsEntityId()
  @IsNotEmpty()
  ctaIngredientId!: string;

  @ApiProperty({ description: 'Brand ID' })
  @IsEntityId()
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
  @IsEntityId()
  @IsNotEmpty()
  ctaIngredientId!: string;

  @ApiProperty({ description: 'Brand ID' })
  @IsEntityId()
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
