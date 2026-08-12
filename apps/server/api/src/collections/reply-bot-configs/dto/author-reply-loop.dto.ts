import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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
}

export class AuthorReplyInboxQueryDto {
  @IsEntityId()
  @ApiProperty({ description: 'Brand id' })
  brandId!: string;

  @IsNumber()
  @Min(1)
  @Max(168)
  @IsOptional()
  @ApiProperty({
    default: 24,
    description: 'Lookback window in hours',
    required: false,
  })
  hours?: number;
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

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiProperty({ required: false })
  parentPostPreview?: string;
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
}
