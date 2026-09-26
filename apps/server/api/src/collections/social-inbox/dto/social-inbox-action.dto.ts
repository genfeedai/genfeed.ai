import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  SocialConversationStatus,
  SocialMessageType,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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
}

export class SocialDmDto extends SocialReplyDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  recipientId?: string;
}

export class SocialDraftDto extends SocialDmDto {
  @ApiProperty({
    enum: [SocialMessageType.REPLY, SocialMessageType.DM],
    required: false,
  })
  @IsOptional()
  @IsIn([SocialMessageType.REPLY, SocialMessageType.DM])
  messageType?: SocialMessageType.DM | SocialMessageType.REPLY;
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
  @ApiProperty({ enum: SocialConversationStatus, required: false })
  @IsOptional()
  @IsEnum(SocialConversationStatus)
  status?: SocialConversationStatus;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ nullable: true, required: false, type: String })
  @IsOptional()
  @IsEntityId()
  assignedOwnerId?: string | null;
}

/**
 * The client sends what it actually saw as unread when it decided to mark
 * the thread read — never re-derived from a fresh server read, which would
 * still race a reply landing between the client's render and this request.
 */
export class SocialConversationReadDto {
  @ApiProperty({ minimum: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  unreadCountSeen?: number;
}
