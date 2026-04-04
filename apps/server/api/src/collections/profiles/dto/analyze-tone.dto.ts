import { IsEnum, IsString } from 'class-validator';

export class AnalyzeToneDto {
  @IsString()
  content!: string;

  @IsEnum(['image', 'video', 'voice', 'article'])
  contentType!: 'image' | 'video' | 'voice' | 'article';

  @IsString()
  profileId!: string;
}
