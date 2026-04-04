import { IngredientCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UploadImageDto {
  @IsEnum(IngredientCategory)
  @ApiProperty({
    description: 'Category of the ingredient to upload',
    enum: IngredientCategory,
    enumName: 'IngredientCategory',
    required: true,
  })
  readonly category!: IngredientCategory;
}
