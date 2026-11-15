import { IsEnum, IsOptional } from 'class-validator';

const REWRITE_PLATFORMS = [
  'tiktok',
  'instagram',
  'twitter',
  'linkedin',
  'youtube',
] as const;

const REWRITE_TONES = [
  'hook',
  'story',
  'educational',
  'controversial',
  'motivational',
] as const;

export class RewriteHighlightDto {
  @IsOptional()
  @IsEnum(REWRITE_PLATFORMS)
  platform?: string = 'tiktok';

  @IsOptional()
  @IsEnum(REWRITE_TONES)
  tone?: string = 'hook';
}
