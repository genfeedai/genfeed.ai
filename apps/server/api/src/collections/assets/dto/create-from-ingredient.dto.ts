import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetCategory } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class CreateFromIngredientDto {
  @IsEntityId()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The ingredient ID to copy from',
    required: true,
  })
  readonly ingredientId!: string;

  @IsString()
  @IsIn([AssetCategory.LOGO, AssetCategory.BANNER, AssetCategory.REFERENCE])
  @IsNotEmpty()
  @ApiProperty({
    description: 'Asset category (logo or banner)',
    enum: [AssetCategory.LOGO, AssetCategory.BANNER, AssetCategory.REFERENCE],
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
  readonly parentId!: string;
}
