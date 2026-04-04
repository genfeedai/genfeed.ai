import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsMongoId,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';

export class TweetScheduleItemDto {
  @IsMongoId()
  @ApiProperty({
    description: 'Post ID to schedule',
    required: true,
  })
  readonly postId!: Types.ObjectId;

  @IsString()
  @ApiProperty({
    description: 'Tweet text content',
    example: 'This is a sample tweet',
    required: true,
  })
  readonly text!: string;

  @IsDateString()
  @ApiProperty({
    description: 'Scheduled date and time for the tweet (ISO 8601)',
    example: '2025-11-27T14:30:00Z',
    required: true,
  })
  readonly scheduledDate!: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Ingredient ID for attached image (optional)',
    required: false,
  })
  readonly ingredientId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'IANA timezone string for the scheduled date',
    example: 'America/New_York',
    required: false,
  })
  readonly timezone?: string;
}

export class BatchScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TweetScheduleItemDto)
  @ApiProperty({
    description:
      'Array of posts to schedule (updates existing DRAFT posts to SCHEDULED)',
    required: true,
    type: [TweetScheduleItemDto],
  })
  readonly tweets!: TweetScheduleItemDto[];

  @IsMongoId()
  @ApiProperty({
    description: 'Credential ID (Twitter account) to use for publishing',
    required: true,
  })
  readonly credential!: Types.ObjectId;
}
