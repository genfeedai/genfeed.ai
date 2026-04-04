import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class GenerateBrandVoiceDto {
  @IsUrl(
    { require_protocol: false },
    { message: 'Please provide a valid website URL' },
  )
  @IsOptional()
  @MaxLength(500)
  @ApiPropertyOptional({
    description: 'Website URL to scrape for brand voice analysis',
    example: 'https://example.com',
  })
  url?: string;

  @IsMongoId()
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Existing brand ID to use stored data for voice generation',
  })
  brandId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  @ApiPropertyOptional({
    description: 'Target audience description for voice tuning',
    example: 'B2B SaaS founders',
  })
  targetAudience?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  @ApiPropertyOptional({
    description: 'Industry or niche context',
    example: 'Technology',
  })
  industry?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  @ApiPropertyOptional({
    description: 'What the brand sells, creates, or helps with',
    example: 'AI workflow automation for marketers',
  })
  offering?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Examples the brand wants to sound like',
    type: [String],
  })
  examplesToEmulate?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Examples or styles the brand wants to avoid',
    type: [String],
  })
  examplesToAvoid?: string[];
}

export interface GeneratedBrandVoice {
  tone: string;
  style: string;
  audience: string[];
  values: string[];
  taglines: string[];
  hashtags: string[];
  messagingPillars: string[];
  doNotSoundLike: string[];
  sampleOutput: string;
}
