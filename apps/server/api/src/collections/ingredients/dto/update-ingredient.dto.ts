import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

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

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Reference to the training that uses this ingredient',
    required: false,
  })
  readonly training?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Public CDN URL for the generated asset',
    required: false,
  })
  readonly cdnUrl?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Generation progress percentage',
    required: false,
  })
  readonly generationProgress?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Human-readable generation stage',
    required: false,
  })
  readonly generationStage?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Timestamp when generation completed',
    required: false,
    type: Date,
  })
  readonly generationCompletedAt?: Date;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Generation error message, if any',
    required: false,
  })
  readonly generationError?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Underlying generation source/provider',
    required: false,
  })
  readonly generationSource?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Resolved model key used for generation',
    required: false,
  })
  readonly modelUsed?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Storage key for the generated asset',
    required: false,
  })
  readonly s3Key?: string;
}
