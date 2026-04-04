import { IsEnum, IsOptional, IsString } from 'class-validator';

export class GetOptimalTimeDto {
  @IsString()
  contentId!: string;

  @IsEnum(['video', 'image', 'caption', 'article'])
  contentType!: 'video' | 'image' | 'caption' | 'article';

  @IsEnum(['instagram', 'tiktok', 'youtube', 'linkedin', 'twitter', 'facebook'])
  platform!: string;

  @IsOptional()
  @IsEnum(['engagement', 'reach', 'conversions'])
  goal?: 'engagement' | 'reach' | 'conversions';

  @IsOptional()
  @IsString()
  timezone?: string; // Default: 'UTC'
}
