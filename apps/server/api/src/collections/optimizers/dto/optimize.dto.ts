import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class OptimizeContentDto {
  @IsString()
  content!: string;

  @IsEnum(['caption', 'video', 'image', 'article', 'script'])
  contentType!: 'caption' | 'video' | 'image' | 'article' | 'script';

  @IsOptional()
  @IsEnum(['instagram', 'tiktok', 'youtube', 'linkedin', 'twitter', 'facebook'])
  platform?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  goals?: string[]; // What to optimize for

  @IsOptional()
  @IsString()
  scoreId?: string; // Optional: link to existing score

  @IsOptional()
  @IsInt()
  @Min(1)
  maxLength?: number; // Optional: hard length the optimized text must fit
}
