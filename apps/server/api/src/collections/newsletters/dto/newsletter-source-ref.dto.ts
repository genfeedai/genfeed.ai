import {
  NEWSLETTER_SOURCE_TYPES,
  type NewsletterSourceType,
} from '@api/collections/newsletters/newsletter.constants';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class NewsletterSourceRefDto {
  @IsString()
  @MaxLength(160)
  @ApiProperty({ description: 'Human-readable source label' })
  label!: string;

  @IsOptional()
  @IsUrl()
  @ApiProperty({ description: 'Source URL', required: false })
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ApiProperty({ description: 'Optional source note', required: false })
  note?: string;

  @IsIn(NEWSLETTER_SOURCE_TYPES)
  @ApiProperty({
    description: 'Source category',
    enum: NEWSLETTER_SOURCE_TYPES,
    required: true,
  })
  sourceType!: NewsletterSourceType;
}
