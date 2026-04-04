import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class GenerateImageDto {
  @IsString()
  @ApiProperty({ description: 'Persona slug' })
  readonly personaSlug!: string;

  @IsString()
  @ApiProperty({ description: 'Generation prompt' })
  readonly prompt!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Negative prompt', required: false })
  readonly negativePrompt?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Model to use for generation', required: false })
  readonly model?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'LoRA to apply', required: false })
  readonly lora?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'CFG scale', required: false })
  readonly cfgScale?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Number of steps', required: false })
  readonly steps?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Random seed', required: false })
  readonly seed?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Aspect ratio (e.g., 1:1, 16:9)',
    required: false,
  })
  readonly aspectRatio?: string;
}
