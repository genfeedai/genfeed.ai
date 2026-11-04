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
import { IngredientOrigin, TagMatchMode } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional } from 'class-validator';

/**
 * Library filters shared by the images, videos and ingredients list queries:
 * origin, character, tag and tag-match. They compose with every other Library
 * filter, so each list DTO extends this instead of repeating them.
 */
export class LibraryFilterQueryDto extends BaseQueryDto {
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
