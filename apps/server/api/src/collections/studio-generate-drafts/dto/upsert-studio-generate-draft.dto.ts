import { KnowledgeSelectionDto } from '@api/collections/contexts/dto/knowledge-selection.dto';
import type {
  StudioGenerateDraftPayload,
  StudioGenerateDraftReference,
  StudioGenerateReferenceRole,
  StudioGenerateSettings,
  StudioGenerateType,
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
  'video',
  'music',
  'avatar',
  'voice',
] as const satisfies readonly StudioGenerateType[];

export const STUDIO_GENERATE_REFERENCE_ROLES = [
  'reference',
  'startFrame',
  'endFrame',
  'videoReference',
] as const satisfies readonly StudioGenerateReferenceRole[];

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

  @ApiProperty({ enum: STUDIO_GENERATE_REFERENCE_ROLES })
  @IsIn(STUDIO_GENERATE_REFERENCE_ROLES)
  readonly role!: StudioGenerateReferenceRole;
}

export class UpsertStudioGenerateDraftDto
  implements StudioGenerateDraftPayload
{
  @ApiProperty({ enum: STUDIO_GENERATE_DRAFT_TYPES })
  @IsIn(STUDIO_GENERATE_DRAFT_TYPES)
  readonly type!: StudioGenerateType;

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
    Record<StudioGenerateType, Partial<StudioGenerateSettings>>
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
