import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum ManagedInferenceProvider {
  FAL = 'fal',
  LEONARDO = 'leonardoai',
  REPLICATE = 'replicate',
}

export enum ManagedInferenceOperation {
  IMAGE = 'image',
}

export class ManagedInferenceRequestDto {
  @IsEnum(ManagedInferenceProvider)
  @ApiProperty({
    enum: ManagedInferenceProvider,
    enumName: 'ManagedInferenceProvider',
  })
  readonly provider!: ManagedInferenceProvider;

  @IsEnum(ManagedInferenceOperation)
  @ApiProperty({
    enum: ManagedInferenceOperation,
    enumName: 'ManagedInferenceOperation',
  })
  readonly operation!: ManagedInferenceOperation;

  @IsString()
  @ApiProperty({
    description: 'Provider model identifier',
  })
  readonly model!: string;

  @IsObject()
  @ApiProperty({
    description: 'Provider input payload',
  })
  readonly input!: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @ApiProperty({
    default: 1,
    description: 'Credits to debit before running the inference request',
    required: false,
  })
  readonly credits?: number;
}
