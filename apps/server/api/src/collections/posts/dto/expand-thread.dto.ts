import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ExpandToThreadDto {
  @IsNumber()
  @Min(2)
  @Max(5)
  @ApiProperty({
    description:
      'Total number of tweets in the final thread (including original)',
    example: 3,
    maximum: 5,
    minimum: 2,
    required: true,
  })
  readonly count!: number;

  @IsEnum(TweetTone)
  @IsOptional()
  @ApiProperty({
    default: TweetTone.PROFESSIONAL,
    description: 'Tone for the generated thread expansion',
    enum: TweetTone,
    enumName: 'TweetTone',
    required: false,
  })
  readonly tone?: TweetTone;
}
