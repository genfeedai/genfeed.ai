import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import {
  MAX_CHARACTER_FILTER_IDS,
  normalizeIngredientCharacterIds,
} from '@api/helpers/dto/ingredient-characters-query.transform';
import { normalizeIngredientOrigins } from '@api/helpers/dto/ingredient-origins-query.transform';
import {
  MAX_TAG_FILTER_IDS,
  normalizeIngredientTagIds,
  normalizeTagMatchMode,
} from '@api/helpers/dto/ingredient-tags-query.transform';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  LibraryShelf,
  MetadataExtension,
  TagMatchMode,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class IngredientsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter ingredients by folder ID',
    nullable: true,
    required: false,
    type: String,
  })
  @IsOptional()
  @IsEntityId()
  folderId?: string | null;

  @ApiProperty({
    description: 'Filter by parent video ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  parentId?: string;

  @ApiProperty({
    description:
      'Filter by status using repeated query keys (e.g., ?status=GENERATED&status=VALIDATED).',
    enum: IngredientStatus,
    enumName: 'IngredientStatus',
    example: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
    isArray: true,
    required: false,
  })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }
    const values = Array.isArray(value) ? value : [value];
    // Accept legacy lowercase query params from older clients.
    return values.map((entry) =>
      typeof entry === 'string' ? entry.toUpperCase() : entry,
    );
  })
  @IsOptional()
  @IsArray()
  @IsEnum(IngredientStatus, { each: true })
  status?: IngredientStatus[];

  @ApiProperty({
    description: 'Filter ingredients by category',
    enum: IngredientCategory,
    enumName: 'IngredientCategory',
    required: false,
  })
  @IsOptional()
  @IsEnum(IngredientCategory)
  category?: IngredientCategory;

  @ApiProperty({
    description:
      'Filter ingredients by one or more categories using repeated query keys ' +
      '(e.g., ?categories=IMAGE&categories=VIDEO). This is the Library type ' +
      'axis — it composes with `shelf` and `folderId` rather than replacing ' +
      'them. Takes precedence over the single-value `category` filter.',
    enum: IngredientCategory,
    enumName: 'IngredientCategory',
    example: [IngredientCategory.IMAGE, IngredientCategory.VIDEO],
    isArray: true,
    required: false,
  })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }
    const values = Array.isArray(value) ? value : [value];
    // Accept legacy lowercase / hyphenated spellings from older clients.
    return values.map((entry) =>
      typeof entry === 'string'
        ? entry.replace(/-/g, '_').toUpperCase()
        : entry,
    );
  })
  @IsOptional()
  @IsArray()
  @IsEnum(IngredientCategory, { each: true })
  categories?: IngredientCategory[];

  @ApiProperty({
    description:
      'Filter by Library shelf — the generation-state axis. A shelf is a saved ' +
      'query (Generating, Unsorted, Needs review, Approved, Failed, Archived), ' +
      'not a location, and owns the status filter when set.',
    enum: LibraryShelf,
    enumName: 'LibraryShelf',
    required: false,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsEnum(LibraryShelf)
  shelf?: LibraryShelf;

  @ApiProperty({
    description: 'Search ingredients by name or description',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Filter by video format',
    enum: MetadataExtension,
    enumName: 'MetadataExtension',
    required: false,
  })
  @IsOptional()
  @IsEnum(MetadataExtension)
  format?: MetadataExtension;

  @ApiProperty({
    description:
      'Filter by permanent asset origin using repeated query keys ' +
      '(e.g., ?origins=UPLOADED&origins=IMPORTED). Origin is a Library filter ' +
      'beside type, shelf and folder; it composes with all of them.',
    enum: IngredientOrigin,
    enumName: 'IngredientOrigin',
    example: [IngredientOrigin.UPLOADED],
    isArray: true,
    required: false,
  })
  @Transform(({ value }) => normalizeIngredientOrigins(value))
  @IsOptional()
  @IsArray()
  @IsEnum(IngredientOrigin, { each: true })
  origins?: IngredientOrigin[];

  @ApiProperty({
    description:
      'Filter by the character an asset was generated with, using repeated ' +
      'query keys (e.g., ?characters=<id>&characters=<id>). Any-match. Only ' +
      'characters available to the active brand are honoured; an unavailable ' +
      'id matches nothing. Composes with every other Library filter.',
    isArray: true,
    required: false,
    type: String,
  })
  @Transform(({ value }) => normalizeIngredientCharacterIds(value))
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CHARACTER_FILTER_IDS)
  @IsEntityId({ each: true })
  characters?: string[];

  @ApiProperty({
    description:
      'Filter by tags using repeated query keys (e.g., ?tags=<id>&tags=<id>). ' +
      'Combined by `tagMatch`. Tags carry human judgment (campaign, series, ' +
      'episode); the filter composes with every other Library filter.',
    isArray: true,
    required: false,
    type: String,
  })
  @Transform(({ value }) => normalizeIngredientTagIds(value))
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAG_FILTER_IDS)
  @IsEntityId({ each: true })
  tags?: string[];

  @ApiProperty({
    default: TagMatchMode.ANY,
    description:
      'How `tags` combine: `any` (default) returns assets with at least one ' +
      'selected tag, `all` returns assets carrying every selected tag.',
    enum: TagMatchMode,
    enumName: 'TagMatchMode',
    required: false,
  })
  @Transform(({ value }) => normalizeTagMatchMode(value))
  @IsOptional()
  @IsEnum(TagMatchMode)
  tagMatch?: TagMatchMode;
}
