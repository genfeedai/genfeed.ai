import { TranscriptStatus } from '@genfeedai/enums';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';

export class TranscriptVideoMetadataDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  duration?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  viewCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  likeCount?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateTranscriptDto {
  @IsOptional()
  @IsString()
  transcriptText?: string;

  @IsOptional()
  @IsString()
  videoTitle?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  videoDuration?: number;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(TranscriptStatus)
  status?: TranscriptStatus;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  audioFileUrl?: string;

  @IsOptional()
  article?: Types.ObjectId;

  @IsOptional()
  @ValidateNested()
  @Type(() => TranscriptVideoMetadataDto)
  videoMetadata?: TranscriptVideoMetadataDto;
}
