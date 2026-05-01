import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GenerateThreadDto {
  @IsString()
  @ApiProperty({
    description: 'Topic or prompt for generating the thread',
    example: 'Why AI will transform content creation',
    required: true,
  })
  readonly topic!: string;

  @IsNumber()
  @Min(2)
  @Max(25)
  @ApiProperty({
    description: 'Number of tweets in the thread',
    example: 5,
    maximum: 25,
    minimum: 2,
    required: true,
  })
  readonly count!: number;

  @IsEntityId()
  @ApiProperty({
    description: 'Credential ID (Twitter account) to use',
    required: true,
  })
  readonly credential!: string;

  @IsEnum(TweetTone)
  @IsOptional()
  @ApiProperty({
    default: TweetTone.PROFESSIONAL,
    description: 'Tone for the generated thread',
    enum: TweetTone,
    enumName: 'TweetTone',
    required: false,
  })
  readonly tone?: TweetTone;

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    description:
      'Optional trend source reference IDs to preserve remix lineage',
    required: false,
    type: [String],
  })
  readonly sourceReferenceIds?: string[];

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description: 'Optional originating trend ID for remix lineage',
    required: false,
  })
  readonly trendId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional originating source URL for remix lineage fallback',
    required: false,
  })
  readonly sourceUrl?: string;
}
