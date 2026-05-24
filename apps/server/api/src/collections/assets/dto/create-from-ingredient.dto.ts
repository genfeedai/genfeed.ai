import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateFromIngredientDto {
  @IsEntityId()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The ingredient ID to copy from',
    required: true,
  })
  readonly ingredientId!: string;

  @IsString()
  @IsEnum(AssetCategory)
  @IsNotEmpty()
  @ApiProperty({
    description: 'Asset category (logo or banner)',
    enum: AssetCategory,
    enumName: 'AssetCategory',
    required: true,
  })
  readonly category!: AssetCategory;

  @IsEntityId()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The parent brand ID',
    required: true,
  })
  readonly parent!: string;
}
