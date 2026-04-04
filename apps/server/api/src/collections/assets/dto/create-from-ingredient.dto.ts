import { AssetCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsNotEmpty, IsString } from 'class-validator';

export class CreateFromIngredientDto {
  @IsMongoId()
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

  @IsMongoId()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The parent brand ID',
    required: true,
  })
  readonly parent!: string;
}
