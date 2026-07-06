import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const CONVERSATION_STATUSES = [
  'open',
  'needs_review',
  'resolved',
  'archived',
] as const;

export class SocialReplyDto {
  @ApiProperty({ maxLength: 5000, minLength: 1 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  workflowRunId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  agentRunId?: string;
}

export class SocialDmDto extends SocialReplyDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  recipientId?: string;
}

export class SocialDraftDto extends SocialDmDto {
  @ApiProperty({ enum: ['reply', 'dm'], required: false })
  @IsOptional()
  @IsIn(['reply', 'dm'])
  messageType?: 'dm' | 'reply';
}

const DRAFT_DECISIONS = ['approved', 'rejected'] as const;

/**
 * Draft review decision. Collapses the former
 * `POST /drafts/:messageId/{approve,reject}` action routes into a single
 * `PATCH /drafts/:messageId` status transition — the service still performs
 * the publish side-effect behind the `approved` verb.
 */
export class SocialDraftUpdateDto {
  @ApiProperty({ enum: DRAFT_DECISIONS })
  @IsIn(DRAFT_DECISIONS)
  status!: (typeof DRAFT_DECISIONS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/**
 * Partial conversation update. Collapses the former single-field
 * `PATCH /:conversationId/{status,tags,assignment}` routes into one
 * `PATCH /:conversationId` accepting any subset of the mutable fields.
 */
export class SocialConversationUpdateDto {
  @ApiProperty({ enum: CONVERSATION_STATUSES, required: false })
  @IsOptional()
  @IsIn(CONVERSATION_STATUSES)
  status?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEntityId()
  assignedOwnerId?: string | null;
}
