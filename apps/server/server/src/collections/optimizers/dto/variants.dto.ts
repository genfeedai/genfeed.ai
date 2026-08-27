import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GenerateVariantsDto {
  @IsString()
  content!: string;

  @IsEnum(['caption', 'video', 'image', 'article', 'script'])
  contentType!: 'caption' | 'video' | 'image' | 'article' | 'script';

  @IsOptional()
  @IsEnum(['instagram', 'tiktok', 'youtube', 'linkedin', 'twitter', 'facebook'])
  platform?: string;

  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(5)
  count?: number; // How many variants (default: 3)

  @IsOptional()
  @IsEnum(['tone', 'length', 'cta', 'style'])
  variationType?: 'tone' | 'length' | 'cta' | 'style';
}
