import { CreateClipProjectDto } from '@api/collections/clip-projects/dto/create-clip-project.dto';
import { ClipProjectStatus } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class VideoMetadataDto {
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Video duration in seconds', required: false })
  readonly duration?: number;

  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Video width in pixels', required: false })
  readonly width?: number;

  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Video height in pixels', required: false })
  readonly height?: number;

  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Video frames per second', required: false })
  readonly fps?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Video codec', required: false })
  readonly codec?: string;

  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Video file size in bytes', required: false })
  readonly fileSize?: number;
}

export class TranscriptSegmentDto {
  @IsNumber()
  @ApiProperty({ description: 'Segment start time in seconds', required: true })
  readonly start!: number;

  @IsNumber()
  @ApiProperty({ description: 'Segment end time in seconds', required: true })
  readonly end!: number;

  @IsString()
  @ApiProperty({ description: 'Segment text content', required: true })
  readonly text!: string;
}

export class UpdateClipProjectDto extends PartialType(CreateClipProjectDto) {
  @IsOptional()
  @IsIn([...ClipProjectStatus])
  @ApiProperty({
    description: 'Project processing status',
    enum: ClipProjectStatus,
    enumName: 'ClipProjectStatus',
    required: false,
  })
  readonly status?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @ApiProperty({
    description: 'Processing progress percentage (0-100)',
    required: false,
  })
  readonly progress?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Full transcript text',
    required: false,
  })
  readonly transcriptText?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Transcript in SRT format',
    required: false,
  })
  readonly transcriptSrt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranscriptSegmentDto)
  @ApiProperty({
    description: 'Transcript segments with timestamps',
    required: false,
    type: [TranscriptSegmentDto],
  })
  readonly transcriptSegments?: TranscriptSegmentDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => VideoMetadataDto)
  @ApiProperty({
    description: 'Video metadata',
    required: false,
    type: VideoMetadataDto,
  })
  readonly videoMetadata?: VideoMetadataDto;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @ApiProperty({
    description: 'Error message if processing failed',
    required: false,
  })
  readonly error?: string | null;

  @IsOptional()
  @IsObject()
  @ApiProperty({
    description: 'Readiness contract for terminal clip handoff',
    required: false,
  })
  readonly readiness?: Record<string, unknown>;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsDateString()
  @ApiProperty({
    description: 'Timestamp when the project reached a terminal status',
    required: false,
  })
  readonly terminalAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiProperty({
    description: 'Number of ready clips in the project',
    required: false,
  })
  readonly readyClipCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiProperty({
    description: 'Number of failed clips in the project',
    required: false,
  })
  readonly failedClipCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiProperty({
    description: 'Number of non-terminal clips in the project',
    required: false,
  })
  readonly pendingClipCount?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether the project is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
