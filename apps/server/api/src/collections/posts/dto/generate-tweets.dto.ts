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

export enum TweetTone {
  PROFESSIONAL = 'professional',
  CASUAL = 'casual',
  VIRAL = 'viral',
  EDUCATIONAL = 'educational',
  HUMOROUS = 'humorous',
}

export class GenerateTweetsDto {
  @IsString()
  @ApiProperty({
    description: 'Topic or prompt for generating tweets',
    example: 'AI productivity tips',
    required: true,
  })
  readonly topic!: string;

  @IsNumber()
  @Min(1)
  @Max(50)
  @ApiProperty({
    description: 'Number of tweets to generate',
    example: 10,
    maximum: 50,
    minimum: 1,
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
    description: 'Tone for the generated tweets',
    enum: TweetTone,
    enumName: 'TweetTone',
    required: false,
  })
  readonly tone?: TweetTone;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'twitter',
    description: 'Platform for the tweets (default: twitter)',
    example: 'twitter',
    required: false,
  })
  readonly platform?: string;

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
