import { WatchlistPlatform } from '@genfeedai/enums';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class QuickAddWatchlistsDto {
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
}
