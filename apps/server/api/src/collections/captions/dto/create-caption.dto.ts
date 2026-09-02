import { resolveIngredientIdAlias } from '@api/helpers/dto/ingredient-id-alias.transform';
import { RESOLVE_QUERY_ALIASES } from '@api/helpers/pipes/validation.pipe';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { CaptionFormat } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

export class CreateCaptionDto {
  static readonly [RESOLVE_QUERY_ALIASES] = resolveIngredientIdAlias;

  @IsEntityId()
  @ApiProperty({
    description: 'The ingredient ID that this caption belongs to',
    required: true,
  })
  ingredientId!: string;

  @IsString()
  @ApiProperty({
    default: 'en',
    description: 'The language code for the caption (e.g., en, es, fr)',
    required: true,
  })
  readonly language!: string;

  @IsString()
  @IsEnum(CaptionFormat)
  @ApiProperty({
    default: CaptionFormat.SRT,
    description: 'The format of the caption file',
    enum: CaptionFormat,
    enumName: 'CaptionFormat',
    required: true,
  })
  readonly format!: CaptionFormat;
}
