import {
  NEWSLETTER_STATUSES,
  type NewsletterStatus,
} from '@api/collections/newsletters/newsletter.constants';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class NewslettersQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Search newsletters by title/topic/content',
    required: false,
  })
  search?: string;

  @ApiProperty({
    description: 'Filter by newsletter status',
    enum: NEWSLETTER_STATUSES,
    isArray: true,
    required: false,
  })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }
    return Array.isArray(value) ? value : [value];
  })
  @IsOptional()
  @IsArray()
  @IsIn(NEWSLETTER_STATUSES, { each: true })
  status?: NewsletterStatus[];
}
