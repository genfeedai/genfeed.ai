import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IngredientCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';

export class IngredientsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter ingredients by brand ID',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  brand?: string;

  @ApiProperty({
    description: 'Filter ingredients by folder ID',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  folder?: string;

  @ApiProperty({
    description: 'Filter by parent video ID',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  parent?: string;

  @ApiProperty({
    description: 'Filter ingredients by status',
    required: false,
  })
  @IsOptional()
  @IsString()
  status?: string;

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
    description: 'Search ingredients by name or description',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Filter by video format',
    required: false,
  })
  @IsOptional()
  @IsString()
  format?: string;
}
