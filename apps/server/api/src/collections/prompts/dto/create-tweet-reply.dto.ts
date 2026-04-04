import { ReplyLength, ReplyTone } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTweetReplyDto {
  @IsString()
  @ApiProperty({
    description: 'The original tweet content to reply to',
    required: true,
  })
  readonly tweetContent!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The Twitter username of the tweet author',
    required: false,
  })
  readonly tweetAuthor?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Additional context or instructions for the reply',
    required: false,
  })
  readonly context?: string;

  @IsEnum(ReplyTone)
  @IsOptional()
  @ApiProperty({
    default: ReplyTone.FRIENDLY,
    description: 'The tone of the reply',
    enum: ReplyTone,
    enumName: 'ReplyTone',
    required: false,
  })
  readonly tone?: ReplyTone;

  @IsEnum(ReplyLength)
  @IsOptional()
  @ApiProperty({
    default: ReplyLength.MEDIUM,
    description: 'The desired length of the reply',
    enum: ReplyLength,
    enumName: 'ReplyLength',
    required: false,
  })
  readonly length?: ReplyLength;

  @IsString()
  @IsOptional()
  @MaxLength(280)
  @ApiProperty({
    description: 'Custom instructions for generating the reply',
    maxLength: 280,
    required: false,
  })
  readonly customInstructions?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The URL of the tweet being replied to',
    required: false,
  })
  readonly tweetUrl?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Whether to tag @grok in the reply to create a thread and request feedback',
    required: false,
  })
  readonly tagGrok?: boolean;
}
