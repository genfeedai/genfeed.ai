import { ContentIntelligencePlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ScrapeConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(500)
  @ApiProperty({
    default: 100,
    description: 'Maximum number of posts to scrape',
    maximum: 500,
    minimum: 10,
    required: false,
  })
  maxPosts?: number;

  @IsOptional()
  @IsNumber()
  @Min(7)
  @Max(365)
  @ApiProperty({
    default: 90,
    description: 'Date range in days to scrape posts from',
    maximum: 365,
    minimum: 7,
    required: false,
  })
  dateRangeDays?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether to include replies in scraping',
    required: false,
  })
  includeReplies?: boolean;
}

export class AddCreatorDto {
  @IsEnum(ContentIntelligencePlatform)
  @ApiProperty({
    description: 'Platform where the creator is active',
    enum: ContentIntelligencePlatform,
    enumName: 'ContentIntelligencePlatform',
    example: ContentIntelligencePlatform.LINKEDIN,
  })
  platform!: ContentIntelligencePlatform;

  @IsString()
  @MaxLength(100)
  @ApiProperty({
    description: 'Creator handle/username (without @)',
    example: 'justinwelsh',
  })
  handle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({
    description: 'Display name of the creator',
    required: false,
  })
  displayName?: string;

  @IsOptional()
  @IsUrl()
  @ApiProperty({
    description: 'Profile URL of the creator',
    required: false,
  })
  profileUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Tags to categorize this creator',
    required: false,
    type: [String],
  })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @ApiProperty({
    description: 'Niche/industry of the creator',
    required: false,
  })
  niche?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Scrape configuration options',
    required: false,
    type: ScrapeConfigDto,
  })
  scrapeConfig?: ScrapeConfigDto;
}
