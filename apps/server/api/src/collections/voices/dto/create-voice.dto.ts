import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';

export class CreateVoiceDto extends OmitType(CreateIngredientDto, [
  'metadata',
]) {
  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'heygen',
    description: 'The voice provider service',
    required: false,
  })
  readonly provider?: string;

  @ValidateNested()
  @IsOptional()
  @Type(() => CreateMetadataDto)
  @ApiProperty({
    description: 'Optional metadata associated with the voice',
    required: false,
    type: () => CreateMetadataDto,
  })
  readonly metadata?: CreateMetadataDto;
}
