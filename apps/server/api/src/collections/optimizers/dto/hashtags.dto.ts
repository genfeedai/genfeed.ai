import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SuggestHashtagsDto {
  @IsString()
  content!: string;

  @IsEnum(['instagram', 'tiktok', 'youtube', 'linkedin', 'twitter', 'facebook'])
  platform!: string;

  @IsOptional()
  @IsString()
  niche?: string; // e.g., 'fitness', 'tech', 'travel'

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  count?: number; // How many hashtags to suggest (default: 10)

  @IsOptional()
  @IsEnum(['trending', 'relevant', 'balanced'])
  strategy?: 'trending' | 'relevant' | 'balanced';
}
