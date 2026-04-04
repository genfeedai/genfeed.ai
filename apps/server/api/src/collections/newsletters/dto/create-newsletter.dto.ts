import { NewsletterSourceRefDto } from '@api/collections/newsletters/dto/newsletter-source-ref.dto';
import {
  NEWSLETTER_STATUSES,
  type NewsletterStatus,
} from '@api/collections/newsletters/newsletter.constants';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';

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
  @IsMongoId({ each: true })
  @ApiProperty({
    description: 'Prior newsletters used as context',
    required: false,
    type: [String],
  })
  contextNewsletterIds?: Types.ObjectId[];

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
}
