import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { normalizeIngredientOrigins } from '@api/helpers/dto/ingredient-origins-query.transform';
import { IngredientOrigin } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional } from 'class-validator';

export class AvatarsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description:
      'Filter by permanent asset origin using repeated query keys ' +
      '(e.g., ?origins=UPLOADED&origins=IMPORTED).',
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
}
