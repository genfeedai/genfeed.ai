import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class SaveTrendPreferencesDto {
  @ApiProperty({
    description: 'Brand ID (optional, for brand-specific preferences)',
    required: false,
  })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiProperty({
    description: 'Categories/Industries of interest',
    example: ['tech', 'finance', 'healthcare'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiProperty({
    description: 'Specific keywords/topics to track',
    example: ['AI', 'cryptocurrency', 'startups'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiProperty({
    description: 'Preferred platforms',
    enum: [
      'tiktok',
      'instagram',
      'linkedin',
      'twitter',
      'youtube',
      'reddit',
      'pinterest',
    ],
    example: ['twitter', 'tiktok', 'youtube'],
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(
    [
      'tiktok',
      'instagram',
      'linkedin',
      'twitter',
      'youtube',
      'reddit',
      'pinterest',
    ],
    { each: true },
  )
  platforms?: string[];

  @ApiProperty({
    description: 'Specific hashtags to track',
    example: ['#AI', '#TechNews', '#Startups'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];
}
