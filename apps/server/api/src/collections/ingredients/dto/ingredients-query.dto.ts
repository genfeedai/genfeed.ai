import { LibraryFilterQueryDto } from '@api/helpers/dto/library-filter-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  IngredientCategory,
  IngredientStatus,
  LibraryShelf,
  MetadataExtension,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const HYPHENS_PATTERN = /-/g;

export class IngredientsQueryDto extends LibraryFilterQueryDto {
  @ApiProperty({
    description:
      'Superadmin only: list assets across every organization. Ignored when ' +
      '`organizationId` narrows the read to one tenant; any other caller gets a 403.',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  allOrganizations?: boolean;

  @ApiProperty({
    description:
      'List every brand in the organization (and unbranded assets), ignoring ' +
      'the session brand. An explicit `brandId` still narrows the list.',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  allBrands?: boolean;

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
        ? entry.replace(HYPHENS_PATTERN, '_').toUpperCase()
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
    description:
      'Page by keyset cursor instead of page number. Applies when `sort` is a single `createdAt` or `updatedAt` key; other orders fall back to page-number pagination. Responses carry `links.cursor` instead of `links.pagination` and skip the total count.',
    enum: ['cursor'],
    required: false,
  })
  @IsOptional()
  @IsIn(['cursor'])
  paging?: 'cursor';

  @ApiProperty({
    description:
      'Opaque `links.cursor.nextCursor` from the previous keyset page. Requires `paging=cursor`.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiProperty({
    description: 'Filter by video format',
    enum: MetadataExtension,
    enumName: 'MetadataExtension',
    required: false,
  })
  @IsOptional()
  @IsEnum(MetadataExtension)
  format?: MetadataExtension;
}
