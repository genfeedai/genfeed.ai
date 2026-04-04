import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { Types } from 'mongoose';

export class AutoCreateContextDto {
  @ApiProperty({
    description: 'Label of the context',
  })
  @IsString()
  label!: string;

  @ApiProperty({
    description: 'Description of the context',
  })
  @IsString()
  description!: string;

  @ApiProperty({
    description: 'Social media platform',
    enum: ['instagram', 'tiktok', 'youtube', 'linkedin', 'twitter'],
  })
  @IsEnum(['instagram', 'tiktok', 'youtube', 'linkedin', 'twitter'])
  platform!: 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'twitter';

  @ApiProperty({
    description: 'Brand ID to auto-create context from',
  })
  @IsMongoId()
  brandId!: Types.ObjectId;

  @ApiProperty({
    default: true,
    description: 'Include posts content in context',
    required: false,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  includePosts?: boolean;

  @ApiProperty({
    default: true,
    description: 'Include engagement analytics in context',
    required: false,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  includeAnalytics?: boolean;

  @ApiProperty({
    description: 'Date range for content to include (ISO dates)',
    example: { end: '2025-10-16', start: '2025-01-01' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  dateRange?: {
    start: string;
    end: string;
  };
}
