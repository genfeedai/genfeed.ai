import { WatchlistPlatform } from '@genfeedai/enums';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { Types } from 'mongoose';

export class CreateWatchlistDto {
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? new Types.ObjectId(value) : value,
  )
  brand!: Types.ObjectId;

  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? new Types.ObjectId(value) : value,
  )
  organization!: Types.ObjectId;

  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? new Types.ObjectId(value) : value,
  )
  user!: Types.ObjectId;

  @IsNotEmpty()
  @IsString()
  label!: string;

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
