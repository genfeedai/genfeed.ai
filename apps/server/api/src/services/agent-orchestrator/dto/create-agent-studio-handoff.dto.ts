import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import type { StudioGenerateType } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** Generous enough for any real Agent-resolved prompt; bounds the record
 * that otherwise sits in Redis, unvalidated in size, for the handoff's
 * 10-minute TTL (#4716 re-review P3). */
const MAX_HANDOFF_PROMPT_LENGTH = 8000;
/** No legitimate generation attaches anywhere near this many references —
 * bounds the same unvalidated-size record. */
const MAX_HANDOFF_REFERENCES = 20;

const STUDIO_GENERATE_TYPES = [
  'image',
  'video',
  'music',
  'avatar',
  'voice',
] as const satisfies readonly StudioGenerateType[];

/**
 * #4670 Agent → Studio handoff creation. `organizationId`/`userId` are never
 * part of this body — the controller derives them from the authenticated
 * request.
 */
export class CreateAgentStudioHandoffDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  @Matches(/^[a-z0-9][a-z0-9-]*$/i, { each: true })
  @ApiProperty({ required: false, type: [String] })
  readonly requestedSkillSlugs?: string[];

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  @ApiProperty({ required: false })
  readonly harness?: boolean;

  @IsIn(STUDIO_GENERATE_TYPES)
  @ApiProperty({ enum: STUDIO_GENERATE_TYPES })
  readonly type!: StudioGenerateType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_HANDOFF_PROMPT_LENGTH)
  @ApiProperty({ description: 'The prompt as the Agent wrote it' })
  readonly prompt!: string;

  @IsEntityId()
  @ApiProperty({ description: 'Brand the generation was scoped to' })
  readonly brandId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiProperty({
    description:
      'The concrete model the router resolved — never the literal "auto"',
  })
  readonly modelKey!: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  @ApiProperty({ required: false })
  readonly aspectRatio?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(300)
  @ApiProperty({ maximum: 300, minimum: 1, required: false })
  readonly duration?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(8)
  @ApiProperty({ maximum: 8, minimum: 1, required: false })
  readonly outputs?: number;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  @ApiProperty({ required: false })
  readonly resolution?: string;

  @IsOptional()
  @ArrayMaxSize(MAX_HANDOFF_REFERENCES)
  @IsEntityId({ each: true })
  @ApiProperty({ isArray: true, required: false, type: [String] })
  readonly references?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  @ApiProperty({
    description: "Brand identity's portrait URL, for an avatar handoff",
    required: false,
  })
  readonly avatarPhotoUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  @ApiProperty({
    description: 'Provider voice id, for an avatar or voice handoff',
    required: false,
  })
  readonly voiceId?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description:
      'True when the source generation used the brand identity. The server then snapshots that identity at create time.',
    required: false,
  })
  readonly useIdentity?: boolean;
}
