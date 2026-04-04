import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
