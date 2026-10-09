import { KnowledgeSelectionDto } from '@api/collections/contexts/dto/knowledge-selection.dto';
import type {
  StudioGenerateDraftPayload,
  StudioGenerateDraftReference,
  StudioPlaygroundReferenceRole,
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const STUDIO_GENERATE_DRAFT_TYPES = [
  'image',
  'image-edit',
  'video',
  'music',
  'avatar',
  'voice',
] as const satisfies readonly StudioPlaygroundType[];

export const STUDIO_PLAYGROUND_REFERENCE_ROLES = [
  'reference',
  'editSource',
  'editMask',
  'startFrame',
  'endFrame',
  'videoReference',
] as const satisfies readonly StudioPlaygroundReferenceRole[];

export const STUDIO_GENERATE_DRAFT_MAX_PROMPT_LENGTH = 20_000;
export const STUDIO_GENERATE_DRAFT_MAX_REFERENCES = 16;
export const STUDIO_GENERATE_DRAFT_MAX_ATTACHMENTS = 8;

export class StudioGenerateDraftReferenceDto
  implements StudioGenerateDraftReference
{
  @ApiProperty({ description: 'Library ingredient id' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  readonly id!: string;

  @ApiProperty({ enum: STUDIO_PLAYGROUND_REFERENCE_ROLES })
  @IsIn(STUDIO_PLAYGROUND_REFERENCE_ROLES)
  readonly role!: StudioPlaygroundReferenceRole;
}

export class UpsertStudioGenerateDraftDto
  implements StudioGenerateDraftPayload
{
  @ApiProperty({
    description:
      'Brand open in the requesting tab; must belong to the caller organization',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  readonly brandId!: string;

  @ApiProperty({ enum: STUDIO_GENERATE_DRAFT_TYPES })
  @IsIn(STUDIO_GENERATE_DRAFT_TYPES)
  readonly type!: StudioPlaygroundType;

  @ApiProperty({ maxLength: STUDIO_GENERATE_DRAFT_MAX_PROMPT_LENGTH })
  @IsString()
  @MaxLength(STUDIO_GENERATE_DRAFT_MAX_PROMPT_LENGTH)
  readonly prompt!: string;

  @ApiProperty({
    description:
      'Composer settings keyed by asset type; unknown types are discarded',
    type: Object,
  })
  @IsObject()
  readonly settingsByType!: Partial<
    Record<StudioPlaygroundType, Partial<StudioPlaygroundSettings>>
  >;

  @ApiProperty({ type: [StudioGenerateDraftReferenceDto] })
  @IsArray()
  @ArrayMaxSize(STUDIO_GENERATE_DRAFT_MAX_REFERENCES)
  @ValidateNested({ each: true })
  @Type(() => StudioGenerateDraftReferenceDto)
  readonly references!: StudioGenerateDraftReferenceDto[];

  @ApiProperty({
    description: 'Composer uploads, already persisted as Library assets',
    type: [StudioGenerateDraftReferenceDto],
  })
  @IsArray()
  @ArrayMaxSize(STUDIO_GENERATE_DRAFT_MAX_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => StudioGenerateDraftReferenceDto)
  readonly attachments!: StudioGenerateDraftReferenceDto[];

  @ApiProperty({ type: KnowledgeSelectionDto })
  @ValidateNested()
  @Type(() => KnowledgeSelectionDto)
  readonly knowledgeSelection!: KnowledgeSelectionDto;
}
