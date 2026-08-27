import { IsEnum, IsOptional, IsString } from 'class-validator';

export class PredictViralDto {
  @IsString()
  content!: string;

  @IsEnum(['caption', 'video', 'image', 'article'])
  contentType!: 'caption' | 'video' | 'image' | 'article';

  @IsOptional()
  @IsEnum(['instagram', 'tiktok', 'youtube', 'linkedin', 'twitter', 'facebook'])
  platform?: string;
}
