import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class EnhancePostDto {
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: 'Enhancement prompt',
    example: 'make it shorter',
    required: true,
  })
  prompt!: string; // e.g., "make it shorter", "add hashtags", "make it more engaging"

  @IsEnum(TweetTone)
  @IsOptional()
  @ApiProperty({
    default: TweetTone.PROFESSIONAL,
    description: 'Tone for the enhanced content',
    enum: TweetTone,
    enumName: 'TweetTone',
    required: false,
  })
  tone?: TweetTone;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'When true, return the proposed text on the post without saving it, so the caller can review it first',
    required: false,
  })
  isDraft?: boolean;
}
