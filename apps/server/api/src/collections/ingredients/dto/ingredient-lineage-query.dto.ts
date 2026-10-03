import { INGREDIENT_LINEAGE_PAGE_SIZE } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Lineage reads page through one direction at a time. Both keys are declared:
 * the global validation pipe whitelists, so an undeclared `page` or `limit`
 * would be stripped silently and every request would return page one.
 */
export class IngredientLineageQueryDto {
  @ApiProperty({
    default: 1,
    description: 'Page number for pagination',
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({
    default: INGREDIENT_LINEAGE_PAGE_SIZE,
    description: 'Number of lineage items per page',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = INGREDIENT_LINEAGE_PAGE_SIZE;
}
