import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ApplyProfileDto {
  @IsString()
  prompt!: string;

  @IsEnum(['image', 'video', 'voice', 'article'])
  contentType!: 'image' | 'video' | 'voice' | 'article';

  @IsOptional()
  @IsString()
  profileId?: string; // If not provided, use default profile
}
