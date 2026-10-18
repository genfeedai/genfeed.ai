import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Filters for the superadmin generation ledger. `organizationId` and `brandId`
 * come from {@link BaseQueryDto}.
 */
export class AdminGenerationReviewsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter by generation status',
    enum: IngredientStatus,
    enumName: 'IngredientStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(IngredientStatus)
  status?: IngredientStatus;

  @ApiProperty({
    description: 'Filter by generated media type',
    enum: IngredientCategory,
    enumName: 'IngredientCategory',
    required: false,
  })
  @IsOptional()
  @IsEnum(IngredientCategory)
  category?: IngredientCategory;

  @ApiProperty({
    description: 'Filter by model key used for the generation',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiProperty({
    description: 'Search the prompts, compiled prompt, user email and id',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
