import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import { IsModelKeyOrTraining } from '@api/helpers/validators/model-key-or-training.validator';
import { RouterPriority } from '@genfeedai/enums';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateMusicDto extends OmitType(CreateIngredientDto, [
  'metadata',
]) {
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateMetadataDto)
  @ApiProperty({ required: false, type: () => CreateMetadataDto })
  readonly metadata?: CreateMetadataDto;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Automatically select the best model based on the prompt. If true, the model parameter will be ignored.',
    required: false,
  })
  readonly autoSelectModel?: boolean;

  @IsEnum(RouterPriority)
  @IsOptional()
  @ApiProperty({
    default: RouterPriority.BALANCED,
    description:
      'Priority for auto model routing: quality, speed, cost, or balanced.',
    enum: RouterPriority,
    enumName: 'RouterPriority',
    required: false,
  })
  readonly prioritize?: RouterPriority;

  @IsString()
  @ApiProperty({
    description: 'Description of the music to generate',
    required: true,
  })
  readonly text!: string;

  @IsOptional()
  @IsNumber()
  @Min(4)
  @Max(90)
  @ApiProperty({
    default: 10,
    description: 'Duration in seconds',
    maximum: 90,
    minimum: 4,
    required: false,
  })
  readonly duration?: number;

  @IsOptional()
  @IsString()
  @IsModelKeyOrTraining({
    message: 'Invalid model: must be ModelKey or genfeedai/<id>',
  })
  @ApiProperty({
    description: 'Model key or genfeedai/<id>',
    enum: string,
    enumName: 'ModelKey',
    required: false,
  })
  readonly model?: string;

  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Random seed for generation', required: false })
  readonly seed?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({
    default: 'melody',
    description: 'Model version: melody, large, etc.',
    required: false,
  })
  readonly modelVersion?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  @ApiProperty({
    default: 250,
    description: 'Top-k sampling parameter',
    required: false,
  })
  readonly topK?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiProperty({
    default: 0,
    description: 'Top-p sampling parameter',
    required: false,
  })
  readonly topP?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  @ApiProperty({
    default: 1,
    description: 'Temperature for sampling',
    required: false,
  })
  readonly temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  @ApiProperty({
    default: 3,
    description: 'Classifier free guidance strength',
    required: false,
  })
  readonly classifierFreeGuidance?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(4)
  @ApiProperty({
    default: 1,
    description: 'Number of musics to generate',
    maximum: 4,
    minimum: 1,
    required: false,
  })
  readonly outputs?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'If true, wait for generation to complete before returning the result. Defaults to false (returns immediately with placeholder).',
    required: false,
  })
  readonly waitForCompletion?: boolean;
}
