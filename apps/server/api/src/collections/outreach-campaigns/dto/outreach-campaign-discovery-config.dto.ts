import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class OutreachCampaignDiscoveryConfigDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Keywords to search for',
    example: ['startup', 'saas', 'tech'],
    required: false,
  })
  keywords?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Hashtags to monitor',
    example: ['startup', 'buildinpublic'],
    required: false,
  })
  hashtags?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Subreddits to monitor (Reddit only)',
    example: ['entrepreneur', 'startups'],
    required: false,
  })
  subreddits?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Authors to exclude from targeting',
    example: ['competitor1', 'spammer123'],
    required: false,
  })
  excludeAuthors?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    default: 0,
    description: 'Minimum engagement (likes + retweets)',
    required: false,
  })
  minEngagement?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    default: 10000,
    description: 'Maximum engagement (avoid viral content)',
    required: false,
  })
  maxEngagement?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  @ApiProperty({
    default: 24,
    description: 'Maximum age of content in hours',
    required: false,
  })
  maxAgeHours?: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  @ApiProperty({
    default: 0.5,
    description: 'Minimum relevance score (0-1)',
    required: false,
  })
  minRelevanceScore?: number;
}
