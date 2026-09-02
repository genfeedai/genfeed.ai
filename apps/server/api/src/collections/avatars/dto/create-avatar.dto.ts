import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';

export class CreateAvatarDto extends CreateIngredientDto {
  @ValidateNested()
  @IsOptional()
  @Type(() => CreateMetadataDto)
  @ApiProperty({ required: false, type: () => CreateMetadataDto })
  readonly metadata?: CreateMetadataDto;
}
