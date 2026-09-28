import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateClipProjectFromIngredientDto {
  @IsEntityId()
  @ApiProperty({ description: 'Library video asset to clip', required: true })
  readonly ingredientId!: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Selected brand; the asset must be shared or in this brand',
    required: false,
  })
  readonly brandId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  @ApiProperty({ default: 10, required: false })
  readonly maxClips?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @ApiProperty({ default: 50, required: false })
  readonly minViralityScore?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ default: 'en', required: false })
  readonly language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @ApiProperty({ required: false })
  readonly name?: string;
}
