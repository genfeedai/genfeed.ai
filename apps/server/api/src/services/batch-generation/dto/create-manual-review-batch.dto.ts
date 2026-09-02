import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  REVIEW_BATCH_ITEM_FORMATS,
  type ReviewBatchItemFormat,
} from '@api/services/batch-generation/constants/review-batch-item-format.constant';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Parity with `CreateBatchDto.count` (`@Max(100)`): a manual review handoff can
 * never legitimately exceed the size of a generated batch. Each item either
 * links one existing Post or creates one sequential Post.
 */
const MAX_REVIEW_ITEMS = 100;

class ManualReviewBatchItemDto {
  @ApiProperty({
    description: 'Durable key preventing duplicate canonical draft Posts',
    required: false,
  })
  @IsOptional()
  @IsString()
  targetIdempotencyKey?: string;

  @ApiProperty({
    description: 'Content format for the review item',
    enum: REVIEW_BATCH_ITEM_FORMATS,
    enumName: 'ReviewBatchItemFormat',
  })
  @IsIn(REVIEW_BATCH_ITEM_FORMATS)
  format!: ReviewBatchItemFormat;

  @ApiProperty({
    description: 'Ingredient ID to attach to the draft post',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  ingredientId?: string;

  @ApiProperty({
    description:
      'Existing canonical draft Post to link instead of creating a duplicate',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  postId?: string;

  @ApiProperty({
    description: 'Display title for the linked draft post',
    required: false,
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({
    description: 'Optional media URL for review preview',
    required: false,
  })
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @ApiProperty({
    description: 'Target platform context, if known',
    required: false,
  })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiProperty({
    description: 'Prompt used to generate the asset',
    required: false,
  })
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiProperty({
    description: 'Initial caption or review note',
    required: false,
  })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiProperty({
    description: 'Originating agent action identifier',
    required: false,
  })
  @IsOptional()
  @IsString()
  sourceActionId?: string;

  @ApiProperty({
    description: 'Originating workflow identifier',
    required: false,
  })
  @IsOptional()
  @IsString()
  sourceWorkflowId?: string;

  @ApiProperty({
    description: 'Originating workflow display name',
    required: false,
  })
  @IsOptional()
  @IsString()
  sourceWorkflowName?: string;

  @ApiProperty({
    description: 'Originating workflow execution identifier',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  workflowExecutionId?: string;

  @ApiProperty({
    description: 'Originating content run identifier for publish attribution',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  contentRunId?: string;

  @ApiProperty({
    description: 'Originating variant identifier inside the content run',
    required: false,
  })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({
    description: 'Hook version label used for the publish experiment',
    required: false,
  })
  @IsOptional()
  @IsString()
  hookVersion?: string;

  @ApiProperty({
    description: 'Creative version label used for the publish experiment',
    required: false,
  })
  @IsOptional()
  @IsString()
  creativeVersion?: string;

  @ApiProperty({
    description: 'Named schedule slot used for attribution',
    required: false,
  })
  @IsOptional()
  @IsString()
  scheduleSlot?: string;

  @ApiProperty({
    description:
      'High-level publish intent such as test, campaign, or evergreen',
    required: false,
  })
  @IsOptional()
  @IsString()
  publishIntent?: string;

  @ApiProperty({
    description: 'Opportunity topic that produced the review item',
    required: false,
  })
  @IsOptional()
  @IsString()
  opportunityTopic?: string;

  @ApiProperty({
    description: 'Autopilot source type that originated the review item',
    enum: ['trend', 'event', 'evergreen'],
    required: false,
  })
  @IsOptional()
  @IsIn(['trend', 'event', 'evergreen'])
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';

  @ApiProperty({
    description: 'Overall publish gate score used for review handoff',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  gateOverallScore?: number;

  @ApiProperty({
    description: 'Publish gate reasons carried into the publishing inbox',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gateReasons?: string[];

  @ApiProperty({
    description:
      'Distinguishes an engagement-reply item from a generated content item',
    enum: ['content', 'engagement'],
    required: false,
  })
  @IsOptional()
  @IsIn(['content', 'engagement'])
  type?: 'content' | 'engagement';

  @ApiProperty({
    description: 'Quote/repost/reply distinction for an engagement item',
    required: false,
  })
  @IsOptional()
  @IsString()
  engagementAction?: string;

  @ApiProperty({
    description:
      'External (platform-native) ID of the post an engagement reply answers',
    required: false,
  })
  @IsOptional()
  @IsString()
  targetPostId?: string;

  @ApiProperty({
    description: 'URL of the post an engagement reply answers',
    required: false,
  })
  @IsOptional()
  @IsString()
  targetPostUrl?: string;

  @ApiProperty({
    description: 'Author of the post an engagement reply answers',
    required: false,
  })
  @IsOptional()
  @IsString()
  targetAuthor?: string;

  @ApiProperty({
    description: 'Content of the post an engagement reply answers',
    required: false,
  })
  @IsOptional()
  @IsString()
  targetPostContent?: string;
}

export class CreateManualReviewBatchDto {
  @ApiProperty({
    description: 'Brand ID that owns the review handoff',
  })
  @IsEntityId()
  brandId!: string;

  @ApiProperty({
    description: 'Items to add directly to the human review queue',
    maxItems: MAX_REVIEW_ITEMS,
    type: [ManualReviewBatchItemDto],
  })
  @IsArray()
  @ArrayMaxSize(MAX_REVIEW_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ManualReviewBatchItemDto)
  items!: ManualReviewBatchItemDto[];
}
