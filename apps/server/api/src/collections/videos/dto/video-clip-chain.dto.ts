import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const CLIP_CHAIN_MAX_SEGMENTS = 30;
export const CLIP_CHAIN_MAX_IDENTITY_REFERENCES = 10;

/**
 * Creates an identity-locked clip-chain run (#4653). The character ids are
 * required for the identity path; product and environment stills are optional.
 * All ids are resolved once here and reused verbatim on every segment.
 */
export class VideoClipChainDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CLIP_CHAIN_MAX_IDENTITY_REFERENCES)
  @IsEntityId({ each: true })
  @ApiProperty({
    description:
      'Canonical character still ingredient ids (avatar / character sheet) attached to every segment as identity refs',
    isArray: true,
    type: String,
  })
  readonly characterIngredientIds!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CLIP_CHAIN_MAX_IDENTITY_REFERENCES)
  @IsEntityId({ each: true })
  @ApiProperty({
    description:
      'Optional product still ingredient ids locked on every segment',
    isArray: true,
    required: false,
    type: String,
  })
  readonly productIngredientIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CLIP_CHAIN_MAX_IDENTITY_REFERENCES)
  @IsEntityId({ each: true })
  @ApiProperty({
    description:
      'Optional environment / location still ingredient ids locked on every segment as extra subject refs',
    isArray: true,
    required: false,
    type: String,
  })
  readonly environmentIngredientIds?: string[];

  @IsString()
  @MinLength(1)
  @ApiProperty({ description: 'Allowlisted video generation model key' })
  readonly model!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(CLIP_CHAIN_MAX_SEGMENTS)
  @IsString({ each: true })
  @MaxLength(10_000, { each: true })
  @Matches(/\S/u, {
    each: true,
    message: 'each segment prompt must contain visible text',
  })
  @ApiProperty({
    description:
      'Per-segment motion / dialogue beats. Defines the segment count when `segmentCount` is omitted.',
    isArray: true,
    required: false,
    type: String,
  })
  readonly segmentPrompts?: string[];

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(CLIP_CHAIN_MAX_SEGMENTS)
  @ApiProperty({
    default: 3,
    maximum: CLIP_CHAIN_MAX_SEGMENTS,
    minimum: 2,
    required: false,
  })
  readonly segmentCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  @ApiProperty({
    description:
      'Prose identity line prepended to every segment prompt. Prompt colour only — it never substitutes for the ingredient ids.',
    required: false,
  })
  readonly identityDirective?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  @ApiProperty({ default: 8, maximum: 30, minimum: 1, required: false })
  readonly duration?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/u, {
    message: 'aspectRatio must look like 16:9',
  })
  @ApiProperty({ default: '16:9', required: false })
  readonly aspectRatio?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @ApiProperty({ description: 'Workflow label', required: false })
  readonly label?: string;
}
