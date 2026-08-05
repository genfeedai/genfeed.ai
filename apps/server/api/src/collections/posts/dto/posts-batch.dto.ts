import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Heaviest per-item cost of the batch endpoints: `posts-operations.controller.ts`
 * runs two sequential writes per item (`postsService.patch` plus an activity
 * `create`). This is an interactive scheduling flow, so it stays at the same
 * interactive scale as the other hand-driven batches.
 */
export const POSTS_BATCH_MAX_ITEMS = 50;

export class PostBatchItemDto {
  @IsEntityId()
  @ApiProperty({
    description: 'Post ID to schedule',
    required: true,
  })
  readonly postId!: string;

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

  @IsEntityId()
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

export class PostsBatchDto {
  @IsArray()
  @ArrayMaxSize(POSTS_BATCH_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => PostBatchItemDto)
  @ApiProperty({
    description: `Per-item batch of posts to update (updates existing DRAFT posts to SCHEDULED, max ${POSTS_BATCH_MAX_ITEMS})`,
    maxItems: POSTS_BATCH_MAX_ITEMS,
    required: true,
    type: [PostBatchItemDto],
  })
  readonly items!: PostBatchItemDto[];

  @IsEntityId()
  @ApiProperty({
    description: 'Credential ID (Twitter account) to use for publishing',
    required: true,
  })
  readonly credentialId!: string;
}
