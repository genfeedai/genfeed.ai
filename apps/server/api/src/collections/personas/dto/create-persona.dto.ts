import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  AvatarProvider,
  normalizePersonaHandle,
  PERSONA_HANDLE_PATTERN,
  PersonaContentFormat,
  PersonaStatus,
  VoiceProvider,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ContentStrategyDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Content topics/themes',
    required: false,
    type: [String],
  })
  readonly topics?: string[];

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Brand voice tone descriptor',
    required: false,
  })
  readonly tone?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(PersonaContentFormat, { each: true })
  @ApiProperty({
    description: 'Preferred content formats',
    enum: PersonaContentFormat,
    enumName: 'PersonaContentFormat',
    isArray: true,
    required: false,
  })
  readonly formats?: PersonaContentFormat[];

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Posting cadence (e.g., daily, weekly)',
    required: false,
  })
  readonly frequency?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Priority platform ordering',
    required: false,
    type: [String],
  })
  readonly platforms?: string[];
}

export class CreatePersonaDto {
  @IsString()
  @ApiProperty({
    description: 'Display name of the persona',
    required: true,
  })
  readonly label!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' || value === null || value === undefined
      ? normalizePersonaHandle(value)
      : value,
  )
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @Matches(PERSONA_HANDLE_PATTERN, {
    message:
      'Handle must be 2–32 characters of lowercase letters, numbers, hyphens, or underscores',
  })
  @ApiProperty({
    description:
      'Brand-unique character handle (lowercase [a-z0-9-_], 2–32 chars). Required only for @-mentionability.',
    required: false,
  })
  readonly handle?: string | null;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Bio/description',
    required: false,
  })
  readonly description?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'CDN URL for profile image',
    required: false,
  })
  readonly profileImageUrl?: string;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description: 'Avatar ingredient ID',
    required: false,
  })
  readonly avatarIngredientId?: string;

  @IsOptional()
  @IsEnum(AvatarProvider)
  @ApiProperty({
    description: 'Avatar provider',
    enum: AvatarProvider,
    enumName: 'AvatarProvider',
    required: false,
  })
  readonly avatarProvider?: AvatarProvider;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Provider-side avatar ID',
    required: false,
  })
  readonly avatarExternalId?: string;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description: 'Voice ID',
    required: false,
  })
  readonly voiceIngredientId?: string;

  @IsOptional()
  @IsEnum(VoiceProvider)
  @ApiProperty({
    description: 'Voice provider',
    enum: VoiceProvider,
    enumName: 'VoiceProvider',
    required: false,
  })
  readonly voiceProvider?: VoiceProvider;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Provider-side voice ID',
    required: false,
  })
  readonly voiceExternalId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContentStrategyDto)
  @ApiProperty({
    description: 'Content strategy configuration',
    required: false,
    type: ContentStrategyDto,
  })
  readonly contentStrategy?: ContentStrategyDto;

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    description: 'Linked credential IDs for social accounts',
    required: false,
    type: [String],
  })
  readonly credentials?: string[];

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    description: 'Assigned team member user IDs',
    required: false,
    type: [String],
  })
  readonly assignedMembers?: string[];

  @IsOptional()
  @IsEnum(PersonaStatus)
  @ApiProperty({
    default: PersonaStatus.INACTIVE,
    description: 'Persona status',
    enum: PersonaStatus,
    enumName: 'PersonaStatus',
    required: false,
  })
  readonly status?: PersonaStatus;

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    description: 'Tag IDs',
    required: false,
    type: [String],
  })
  readonly tags?: string[];
}
