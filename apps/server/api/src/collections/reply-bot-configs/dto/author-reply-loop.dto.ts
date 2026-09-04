import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import type { ReplyIntent } from '@api/services/reply-bot/reply-intent.util';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const REPLY_INTENTS = [
  'thanks',
  'question',
  'troll',
  'spam',
  'default',
] as const satisfies readonly ReplyIntent[];

export class SchedulePostWatchDto {
  @IsEntityId()
  @ApiProperty()
  brandId!: string;

  @IsString()
  @MaxLength(64)
  @ApiProperty({ description: 'Post/video id to watch for 24h' })
  postId!: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiProperty({ required: false })
  postPreview?: string;

  @IsIn(['twitter', 'youtube'] as const)
  @IsOptional()
  @ApiProperty({
    default: 'twitter',
    description: 'Platform for the watched post (twitter | youtube)',
    enum: ['twitter', 'youtube'],
    required: false,
  })
  platform?: 'twitter' | 'youtube';
}

export class EnsureAuthorResponderDto {
  @IsEntityId()
  @ApiProperty({ description: 'Brand to enable author-reply loop for' })
  brandId!: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'X credential id (auto-detected when omitted)',
    required: false,
  })
  credentialId?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether the comment_responder bot should be active',
    required: false,
  })
  isActive?: boolean;

  @IsIn(['twitter', 'youtube'] as const)
  @IsOptional()
  @ApiProperty({
    default: 'twitter',
    description: 'Platform for comment_responder (twitter | youtube)',
    required: false,
  })
  platform?: 'twitter' | 'youtube';
}

export class AuthorReplyInboxQueryDto {
  @IsEntityId()
  @ApiProperty({ description: 'Brand id' })
  brandId!: string;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(48)
  @IsOptional()
  @ApiProperty({
    default: 24,
    description: 'Lookback window in hours (capped at 48)',
    required: false,
  })
  hours?: number;

  @IsIn(['twitter', 'youtube'] as const)
  @IsOptional()
  @ApiProperty({
    default: 'twitter',
    description: 'Platform inbox: X (twitter) or YouTube comments',
    enum: ['twitter', 'youtube'],
    required: false,
  })
  platform?: 'twitter' | 'youtube';
}

export class AuthorReplyDraftDto {
  @IsEntityId()
  @ApiProperty()
  brandId!: string;

  @IsString()
  @MaxLength(64)
  @ApiProperty()
  commentId!: string;

  @IsString()
  @MaxLength(4000)
  @ApiProperty()
  commentText!: string;

  @IsString()
  @MaxLength(120)
  @ApiProperty()
  commentAuthor!: string;

  @IsIn(REPLY_INTENTS)
  @IsOptional()
  @ApiProperty({
    description: 'Override auto-classified intent persona',
    enum: REPLY_INTENTS,
    required: false,
  })
  intent?: ReplyIntent;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiProperty({ required: false })
  parentPostPreview?: string;

  @IsIn(['twitter', 'youtube'] as const)
  @IsOptional()
  @ApiProperty({
    default: 'twitter',
    description: 'Platform for harness pack selection (twitter | youtube)',
    enum: ['twitter', 'youtube'],
    required: false,
  })
  platform?: 'twitter' | 'youtube';
}

export class AuthorReplySendDto {
  @IsEntityId()
  @ApiProperty()
  brandId!: string;

  @IsString()
  @MaxLength(64)
  @ApiProperty()
  commentId!: string;

  @IsString()
  @MaxLength(4000)
  @ApiProperty()
  commentText!: string;

  @IsString()
  @MaxLength(120)
  @ApiProperty()
  commentAuthor!: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  @ApiProperty({ required: false })
  commentAuthorId?: string;

  @IsIn(REPLY_INTENTS)
  @IsOptional()
  @ApiProperty({
    description: 'Override auto-classified intent persona',
    enum: REPLY_INTENTS,
    required: false,
  })
  intent?: ReplyIntent;

  @IsString()
  @MaxLength(64)
  @ApiProperty()
  parentPostId!: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiProperty({ required: false })
  parentPostPreview?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  @ApiProperty({
    description: 'Optional pre-edited reply; drafts when omitted',
    required: false,
  })
  replyText?: string;

  @IsIn(['twitter', 'youtube'] as const)
  @IsOptional()
  @ApiProperty({
    default: 'twitter',
    description: 'Platform to post the author reply on (twitter | youtube)',
    enum: ['twitter', 'youtube'],
    required: false,
  })
  platform?: 'twitter' | 'youtube';
}
