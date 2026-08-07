import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

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
}
