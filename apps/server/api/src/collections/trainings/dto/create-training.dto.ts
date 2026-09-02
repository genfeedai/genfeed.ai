import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { TrainingProvider } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Upper bound on `sources`. The create/relaunch handlers fan the resolved
 * source images out into a bulk ingredient update and an `id IN (...)` lookup,
 * so an unbounded array is both a Postgres bind-parameter hazard and a
 * write-amplification vector. The floor stays at 10 (enforced in the handler).
 */
export const MAX_TRAINING_SOURCES = 50;

export class CreateTrainingDto {
  // @IsEntityId()
  // @IsNotEmpty()
  // @ApiProperty({ required: true })
  // readonly organization!: string;

  // @IsEntityId()
  // @IsNotEmpty()
  // @ApiProperty({ required: true })
  // readonly brand!: string;

  // @ApiProperty({ required: true })
  // @IsString()
  // @IsNotEmpty()
  // readonly user!: string;

  @ApiProperty({
    description: 'Array of source ingredient IDs',
    maxItems: MAX_TRAINING_SOURCES,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TRAINING_SOURCES)
  @IsEntityId({ each: true })
  readonly sources?: string[];

  @ApiProperty({ required: true })
  @IsString()
  readonly label!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly description?: string;

  @ApiProperty({ required: true })
  @IsString()
  readonly trigger!: string;

  @ApiProperty({
    enum: ['subject', 'style'],
    enumName: 'TrainingCategory',
    required: true,
  })
  @IsString()
  readonly category!: string;

  @ApiProperty({
    enum: ['processing', 'completed', 'failed'],
    enumName: 'TrainingStatus',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly status?: string;

  @ApiProperty({ required: true })
  @IsNumber()
  readonly steps!: number;

  @ApiProperty({ description: 'Random seed for training', required: false })
  @IsOptional()
  @IsNumber()
  readonly seed?: number;

  @ApiProperty({
    default:
      'replicate/fast-flux-trainer:f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
    description: 'Replicate training model version',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly model?: string;

  @ApiProperty({
    default: 'replicate',
    description: 'Training provider',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(Object.values(TrainingProvider))
  readonly provider?: string;

  @ApiProperty({
    default: 'genfeed-ai/z-image-turbo',
    description: 'Base model for training',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly baseModel?: string;
}
