import { WatchlistPlatform } from '@genfeedai/contracts';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateWatchlistDto {
  /**
   * Defaults to `@{handle}` server-side when omitted (quick-add semantics).
   */
  @IsOptional()
  @IsString()
  label?: string;

  @IsNotEmpty()
  @IsEnum(WatchlistPlatform)
  platform!: WatchlistPlatform;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => {
    // Remove @ prefix if present
    if (typeof value === 'string' && value.startsWith('@')) {
      return value.slice(1);
    }
    return value;
  })
  handle!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  metrics?: {
    followers?: number;
    avgViews?: number;
    engagementRate?: number;
  };

  @IsOptional()
  @IsString()
  profileUrl?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
