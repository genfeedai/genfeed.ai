import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsMongoId, IsOptional } from 'class-validator';

export class UpdateIngredientDto extends PartialType(CreateIngredientDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the ingredient is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Whether this ingredient is marked as favorite',
    required: false,
  })
  readonly isFavorite?: boolean;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Reference to the training that uses this ingredient',
    required: false,
  })
  readonly training?: string;
}
