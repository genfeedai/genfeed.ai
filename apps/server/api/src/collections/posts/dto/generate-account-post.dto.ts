import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import type { SocialGenerationFormat } from '@genfeedai/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GenerateAccountPostDto {
  @IsString()
  @ApiProperty({
    description: 'Topic or prompt for generating account-aware social content',
    example: 'AI productivity tips',
    required: true,
  })
  readonly topic!: string;

  @IsNumber()
  @Min(1)
  @Max(50)
  @ApiProperty({
    description: 'Number of posts to generate',
    example: 1,
    maximum: 50,
    minimum: 1,
    required: true,
  })
  readonly count!: number;

  @IsEntityId()
  @ApiProperty({
    description: 'Credential ID for the selected account',
    required: true,
  })
  readonly credential!: string;

  @IsIn(['post', 'thread'])
  @ApiProperty({
    default: 'post',
    description: 'Account-aware social generation format',
    enum: ['post', 'thread'],
    required: true,
  })
  readonly format!: SocialGenerationFormat;

  @IsEnum(TweetTone)
  @IsOptional()
  @ApiProperty({
    default: TweetTone.PROFESSIONAL,
    description: 'Tone for the generated content',
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
