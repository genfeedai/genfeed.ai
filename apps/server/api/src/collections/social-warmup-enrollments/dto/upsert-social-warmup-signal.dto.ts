import {
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
} from '@genfeedai/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertSocialWarmupSignalDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  key!: string;

  @ApiProperty({ enum: SocialWarmupSignalStatus })
  @IsEnum(SocialWarmupSignalStatus)
  status!: SocialWarmupSignalStatus;

  @ApiProperty({ enum: SocialWarmupSignalSource })
  @IsEnum(SocialWarmupSignalSource)
  source!: SocialWarmupSignalSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observedAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staleAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  evidence?: Record<string, unknown>;
}
