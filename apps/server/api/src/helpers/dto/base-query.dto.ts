import { resolveFolderIdAlias } from '@api/helpers/dto/folder-id-alias.transform';
import { RESOLVE_QUERY_ALIASES } from '@api/helpers/pipes/validation.pipe';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class BaseQueryDto {
  @ApiProperty({
    default: 1,
    description: 'Page number for pagination',
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Transform(({ value }) =>
    value !== undefined && value !== null ? Number(value) : 1,
  )
  page: number = 1;

  @ApiProperty({
    default: 10,
    description: 'Number of items per page',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) =>
    value !== undefined && value !== null ? Number(value) : 10,
  )
  limit: number = 10;

  @ApiProperty({
    default: false,
    description: 'Filter by deleted status',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.isDeleted !== undefined)
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return false;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    if (value === '0' || value === 0) {
      return false;
    }
    if (value === '') {
      return false;
    }
    return Boolean(value);
  })
  @IsBoolean()
  isDeleted: boolean = false;

  @ApiProperty({
    default: 'createdAt: -1',
    description:
      'Sort field(s) and order (e.g., "createdAt: -1" or "category: 1, createdAt: -1")',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    value !== undefined && value !== null ? value : 'createdAt: -1',
  )
  sort: string = 'createdAt: -1';

  @ApiProperty({
    description: 'Filter by organization ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  organizationId?: string;

  @ApiProperty({
    description: 'Filter by brand ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @ApiProperty({
    description: 'Filter by favorite status',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.isFavorite !== undefined)
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    if (value === '0' || value === 0) {
      return false;
    }
    if (value === '') {
      return undefined;
    }
    return value ? true : undefined;
  })
  @IsBoolean()
  isFavorite?: boolean;

  /**
   * Canonical Library folder filter. The client sends `?folder=<id>`; the
   * alias is resolved by {@link resolveFolderIdAlias} through the pipe's
   * `RESOLVE_QUERY_ALIASES` hook — a `@Transform` cannot do this because
   * class-transformer skips transforms for source-absent keys under
   * `exposeDefaultValues: true`.
   */
  @ApiProperty({
    description: 'Filter by folder ID (client key: folder)',
    nullable: true,
    required: false,
    type: String,
  })
  @IsOptional()
  @IsEntityId()
  folderId?: string | null;

  /**
   * Resolves the client's `folder` query key onto `folderId` for every
   * subclass before validation. Statics are inherited, so each Library list
   * DTO inherits this without redeclaring it.
   */
  static readonly [RESOLVE_QUERY_ALIASES] = resolveFolderIdAlias;
}
