import { PostCategory, PostFrequency, PostStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePostDto {
  @IsArray()
  @IsMongoId({ each: true })
  @ArrayMinSize(0)
  @ArrayMaxSize(35)
  @ApiProperty({
    description:
      'Array of ingredient IDs (content) to be published. Order is preserved for carousels. Can be empty array for drafts. Max: 35 (TikTok limit).',
    required: true,
    type: [String],
  })
  readonly ingredients!: string[];

  @ApiProperty({
    description:
      'Optional campaign identifier. When provided with an empty ingredients array, the server resolves approved campaign image ingredients for the current brand.',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly campaign?: string;

  @IsMongoId()
  @ApiProperty({
    description: 'The credential ID (platform account) to use for publishing',
    required: true,
  })
  readonly credential!: string;

  @ApiProperty({
    description: 'The title/label of the post',
    required: false,
  })
  @IsString()
  readonly label!: string;

  @ApiProperty({
    description: 'The description/caption for the post',
    required: true,
  })
  @IsString()
  readonly description!: string;

  @ApiProperty({
    description:
      'Type of media being published (image or video) - automatically derived from ingredient if not provided',
    enum: PostCategory,
    enumName: 'PostCategory',
    required: false,
  })
  @IsOptional()
  @IsEnum(PostCategory)
  readonly category?: PostCategory;

  @ApiProperty({
    default: PostStatus.SCHEDULED,
    description: 'The current status of the post',
    enum: PostStatus,
    enumName: 'PostStatus',
  })
  @IsEnum(PostStatus)
  readonly status!: PostStatus;

  @ApiProperty({
    description: 'Optional tags/hashtags to include with the post',
    required: false,
  })
  @IsOptional()
  @IsArray()
  readonly tags?: string[];

  @ApiProperty({
    description: 'When the post is scheduled to be posted',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  readonly scheduledDate?: Date;

  @ApiProperty({
    default: 'UTC',
    description:
      'IANA timezone string for the scheduled date (e.g., "America/New_York", "Europe/London"). Defaults to UTC if not provided.',
    example: 'America/New_York',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly timezone?: string;

  @ApiProperty({
    description: 'When the post was actually posted',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  readonly publicationDate?: Date;

  @ApiProperty({
    description: 'Whether this post should repeat on a schedule',
    required: false,
  })
  @IsOptional()
  readonly isRepeat?: boolean;

  @ApiProperty({
    default: PostFrequency.NEVER,
    description: 'How often the post should repeat',
    enum: PostFrequency,
    enumName: 'PostFrequency',
    required: false,
  })
  @IsOptional()
  @IsEnum(PostFrequency)
  readonly repeatFrequency?: PostFrequency;

  @ApiProperty({
    default: 1,
    description: 'The interval between repeats (e.g., every 2 days)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  readonly repeatInterval?: number;

  @ApiProperty({
    description: 'When to stop repeating the post',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  readonly repeatEndDate?: Date;

  @ApiProperty({
    default: 0,
    description: 'Maximum number of times to repeat (0 = unlimited)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  readonly maxRepeats?: number;

  @ApiProperty({
    default: [],
    description: 'Days of week to repeat (0=Sunday, 6=Saturday)',
    required: false,
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  readonly repeatDaysOfWeek?: number[];

  @ApiProperty({
    description: 'External platform ID for the published content',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly externalId?: string;

  @ApiProperty({
    description: 'External platform shortcode for the published content',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly externalShortcode?: string;

  @ApiProperty({
    description:
      'Twitter-specific: ID of tweet to quote (creates a quote tweet)',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly quoteTweetId?: string;

  @ApiProperty({
    description:
      'Group ID for batch post notifications. Posts created together (multi-platform batch) share the same groupId.',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly groupId?: string;

  @ApiProperty({
    description: 'Parent post ID for thread replies',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  readonly parent?: string;

  @ApiProperty({
    description: 'Position/order within thread',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  readonly order?: number;

  @ApiProperty({
    description: 'Array of posts for batch thread creation',
    required: false,
    type: [CreatePostDto],
  })
  @IsOptional()
  @IsArray()
  readonly threadPosts?: CreatePostDto[];

  @ApiProperty({
    default: true,
    description:
      'For Instagram Reels only: whether to share the reel to main feed',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly isShareToFeedSelected?: boolean;

  @ApiProperty({
    default: true,
    description: 'Whether to fetch analytics for the post',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly isAnalyticsEnabled?: boolean;

  @ApiProperty({
    description: 'Originating content run ID for closed-loop attribution',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  readonly contentRunId?: string;

  @ApiProperty({
    description: 'Originating variant ID inside the content run',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly variantId?: string;

  @ApiProperty({
    description: 'Hook revision or experiment version label',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly hookVersion?: string;

  @ApiProperty({
    description: 'Creative revision or experiment version label',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly creativeVersion?: string;

  @ApiProperty({
    description: 'Named schedule slot used for publish attribution',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly scheduleSlot?: string;

  @ApiProperty({
    description:
      'High-level publish intent such as test, campaign, or evergreen',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly publishIntent?: string;
}
