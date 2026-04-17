import { ContentDraftStatus } from '@genfeedai/enums';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateContentDraftDto {
  @IsString()
  readonly skillSlug!: string;

  @IsString()
  readonly type!: string;

  @IsString()
  readonly content!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  readonly mediaUrls?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  readonly platforms?: string[];

  @IsObject()
  @IsOptional()
  readonly metadata?: Record<string, unknown>;

  @IsEnum(ContentDraftStatus)
  @IsOptional()
  readonly status?: ContentDraftStatus;

  @IsNumber()
  @IsOptional()
  readonly confidence?: number;

  @IsString()
  readonly generatedBy!: string;

  @IsString()
  @IsOptional()
  readonly contentRunId?: string;
}
