import { NewsletterSourceRefDto } from '@api/collections/newsletters/dto/newsletter-source-ref.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  NEWSLETTER_ACCESS_LEVELS,
  type NewsletterAccessLevel,
} from '@genfeedai/contracts/constants';
import {
  NEWSLETTER_STATUSES,
  type NewsletterStatus,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateNewsletterDto {
  @IsString()
  @MaxLength(200)
  @ApiProperty({ description: 'Newsletter title' })
  label!: string;

  @IsString()
  @MaxLength(200)
  @ApiProperty({ description: 'Primary newsletter topic' })
  topic!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiProperty({ description: 'Optional angle', required: false })
  angle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({ description: 'Short summary', required: false })
  summary?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Markdown content', required: false })
  content?: string;

  @IsOptional()
  @IsIn(NEWSLETTER_STATUSES)
  @ApiProperty({
    description: 'Lifecycle status',
    enum: NEWSLETTER_STATUSES,
    required: false,
  })
  status?: NewsletterStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NewsletterSourceRefDto)
  @ApiProperty({
    description: 'Explicit source references',
    required: false,
    type: [NewsletterSourceRefDto],
  })
  sourceRefs?: NewsletterSourceRefDto[];

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    description: 'Prior newsletters used as context',
    required: false,
    type: [String],
  })
  contextNewsletterIds?: string[];

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Prompt used to generate this newsletter',
    required: false,
  })
  generationPrompt?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ description: 'Scheduled publication time', required: false })
  scheduledFor?: Date;

  @IsOptional()
  @IsIn(NEWSLETTER_ACCESS_LEVELS)
  @ApiProperty({
    description:
      'Who reads the full issue: everyone, subscribers, or paying readers (#9718).',
    enum: NEWSLETTER_ACCESS_LEVELS,
    required: false,
  })
  accessLevel?: NewsletterAccessLevel;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  @ApiProperty({
    description: 'One-time unlock price in credits for a paid issue.',
    required: false,
  })
  unlockPriceCredits?: number;
}
