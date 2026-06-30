import { ClipResultStatus } from '@api/collections/clip-results/schemas/clip-result.schema';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class UpdateClipResultDto {
  @IsString()
  @IsOptional()
  @IsIn([...ClipResultStatus])
  @ApiProperty({
    description: 'Clip status',
    enum: ClipResultStatus,
    enumName: 'ClipResultStatus',
    required: false,
  })
  readonly status?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Extracted video URL', required: false })
  readonly videoUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Extracted video S3 key', required: false })
  readonly videoS3Key?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Captioned video URL', required: false })
  readonly captionedVideoUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Captioned video S3 key', required: false })
  readonly captionedVideoS3Key?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Thumbnail URL', required: false })
  readonly thumbnailUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Caption SRT content', required: false })
  readonly captionSrt?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ description: 'Whether the clip is selected', required: false })
  readonly isSelected?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ description: 'Soft delete flag', required: false })
  readonly isDeleted?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Clip title', required: false })
  readonly title?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Clip summary', required: false })
  readonly summary?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'External provider job ID', required: false })
  readonly providerJobId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Avatar video provider name', required: false })
  readonly providerName?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Readiness contract for clip handoff actions',
    required: false,
  })
  readonly readiness?: Record<string, unknown>;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsDateString()
  @ApiProperty({
    description: 'Timestamp when the clip reached a terminal status',
    required: false,
  })
  readonly terminalAt?: string | null;
}
