import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GeneratePromptsDto {
  @IsString()
  input!: string;

  @IsEnum(['idea', 'variation'])
  mode!: 'idea' | 'variation';

  @IsEnum(['image', 'video'])
  targetMedia!: 'image' | 'video';

  @IsNumber()
  @Min(3)
  @Max(10)
  count!: number;

  @IsOptional()
  @IsString()
  styleHint?: string;
}

export interface GeneratedPromptConfig {
  id: string;
  text: string;
  format: 'portrait' | 'landscape' | 'square';
  style: string;
  mood: string;
  camera: string;
  cameraMovement?: string;
  lighting: string;
}
