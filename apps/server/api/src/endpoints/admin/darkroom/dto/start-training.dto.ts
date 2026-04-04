import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class StartTrainingDto {
  @IsString()
  @ApiProperty({ description: 'Persona slug' })
  readonly personaSlug!: string;

  @IsString()
  @ApiProperty({ description: 'Training label' })
  readonly label!: string;

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ description: 'Source ingredient IDs', type: [String] })
  readonly sourceIds!: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'LoRA name', required: false })
  readonly loraName?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Training steps', required: false })
  readonly steps?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Learning rate', required: false })
  readonly learningRate?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'LoRA rank', required: false })
  readonly loraRank?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'genfeed-ai/z-image-turbo',
    description: 'Base model for training',
    required: false,
  })
  readonly baseModel?: string;
}
