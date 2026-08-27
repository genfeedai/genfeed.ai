import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateContentRunBriefDto {
  @IsString()
  @ApiProperty({
    description: 'Research or discovery source platform',
    required: true,
  })
  readonly platform!: string;

  @IsString()
  @ApiProperty({
    description: 'Source trend identifier',
    required: true,
  })
  readonly trendId!: string;

  @IsString()
  @ApiProperty({
    description: 'Trend or research topic to turn into a brief',
    required: true,
  })
  readonly trendTopic!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Original source URL for research evidence',
    required: false,
  })
  readonly sourceUrl?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Stable source reference ID when available',
    required: false,
  })
  readonly sourceReferenceId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Original source content ID',
    required: false,
  })
  readonly sourceContentId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Source title', required: false })
  readonly title?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Source text body', required: false })
  readonly text?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Source author handle', required: false })
  readonly authorHandle?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Content type for the source', required: false })
  readonly contentType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Matched trend topics from discovery',
    required: false,
    type: [String],
  })
  readonly matchedTrends?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Explicit evidence lines to preserve in the brief',
    required: false,
    type: [String],
  })
  readonly evidence?: string[];

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Target audience', required: false })
  readonly audience?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Remix angle', required: false })
  readonly angle?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Hook hypothesis', required: false })
  readonly hypothesis?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Call to action', required: false })
  readonly callToAction?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Channel fit rationale', required: false })
  readonly channelFit?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Risk note for the brief', required: false })
  readonly risk?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiProperty({
    description: 'Confidence score for the handoff, from 0 to 1',
    required: false,
  })
  readonly confidence?: number;

  @IsOptional()
  @IsObject()
  @ApiProperty({ description: 'Source metrics snapshot', required: false })
  readonly metrics?: Record<string, unknown>;
}
