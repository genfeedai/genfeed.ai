import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import type {
  AdsChannel,
  AdsResearchPlatform,
  SavedAdSource,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveAdDto {
  @IsEntityId()
  @ApiProperty()
  readonly brandId!: string;

  @IsString()
  @MaxLength(255)
  @ApiProperty()
  readonly adId!: string;

  @IsIn(['public', 'my_accounts'])
  @ApiProperty({ enum: ['public', 'my_accounts'] })
  readonly source!: SavedAdSource;

  @IsOptional()
  @IsIn(['meta', 'google', 'tiktok', 'x'])
  @ApiPropertyOptional({ enum: ['meta', 'google', 'tiktok', 'x'] })
  readonly platform?: AdsResearchPlatform;

  @IsOptional()
  @IsIn(['all', 'search', 'display', 'youtube'])
  @ApiPropertyOptional({ enum: ['all', 'search', 'display', 'youtube'] })
  readonly channel?: AdsChannel;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly credentialId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly adAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly loginCustomerId?: string;
}

export class UpdateSavedAdNoteDto {
  @IsEntityId()
  readonly brandId!: string;

  @IsEntityId()
  readonly id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  readonly note?: string | null;
}

export class UnsaveSavedAdDto {
  @IsEntityId()
  readonly brandId!: string;

  @IsEntityId()
  readonly id!: string;
}
