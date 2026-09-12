import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import type { StudioGenerateType } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

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
  @IsIn(STUDIO_GENERATE_TYPES)
  @ApiProperty({ enum: STUDIO_GENERATE_TYPES })
  readonly type!: StudioGenerateType;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The prompt as the Agent wrote it' })
  readonly prompt!: string;

  @IsEntityId()
  @ApiProperty({ description: 'Brand the generation was scoped to' })
  readonly brandId!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description:
      'The concrete model the router resolved — never the literal "auto"',
  })
  readonly modelKey!: string;

  @IsString()
  @IsOptional()
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
  @ApiProperty({ required: false })
  readonly resolution?: string;

  @IsOptional()
  @IsEntityId({ each: true })
  @ApiProperty({ isArray: true, required: false, type: [String] })
  readonly references?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: "Brand identity's portrait URL, for an avatar handoff",
    required: false,
  })
  readonly avatarPhotoUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Provider voice id, for an avatar or voice handoff',
    required: false,
  })
  readonly voiceId?: string;
}
