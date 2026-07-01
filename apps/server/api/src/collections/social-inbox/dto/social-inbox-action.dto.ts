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

export class SocialDraftRejectDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class SocialConversationStatusDto {
  @ApiProperty({ enum: CONVERSATION_STATUSES })
  @IsIn(CONVERSATION_STATUSES)
  status!: string;
}

export class SocialConversationTagsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags!: string[];
}

export class SocialConversationAssignDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEntityId()
  assignedOwnerId?: string | null;
}
