import { IngredientCategory } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class PresignedUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @ApiProperty({ description: 'Original filename', type: String })
  readonly filename!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @ApiProperty({ example: 'image/png', type: String })
  readonly contentType!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(IngredientCategory)
  @ApiProperty({
    default: IngredientCategory.IMAGE,
    enum: IngredientCategory,
    enumName: 'IngredientCategory',
    required: false,
  })
  readonly category?: IngredientCategory;

  @IsInt()
  @Min(1)
  @ApiProperty({
    description:
      'Exact size of the file in bytes. It is checked against the category limit and signed into the upload URL.',
    minimum: 1,
  })
  readonly sizeBytes!: number;
}
