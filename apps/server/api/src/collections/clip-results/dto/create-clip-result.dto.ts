import { ClipResultStatus } from '@api/collections/clip-results/schemas/clip-result.schema';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { OrganizationalCreateDto } from '@api/shared/dto/base/base.dto';
import { CLIP_RESULT_MODES } from '@genfeedai/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateClipResultDto extends OrganizationalCreateDto {
  @IsEntityId()
  @ApiProperty({ description: 'The clip project ID', required: true })
  readonly project!: string;

  @IsNumber()
  @ApiProperty({ description: 'Clip index within the project', required: true })
  readonly index!: number;

  @IsString()
  @ApiProperty({ description: 'Clip title', required: true })
  readonly title!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Clip summary', required: false })
  readonly summary?: string;

  @IsNumber()
  @ApiProperty({ description: 'Start time in seconds', required: true })
  readonly startTime!: number;

  @IsNumber()
  @ApiProperty({ description: 'End time in seconds', required: true })
  readonly endTime!: number;

  @IsNumber()
  @ApiProperty({ description: 'Duration in seconds', required: true })
  readonly duration!: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Virality score (1-100)', required: false })
  readonly viralityScore?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ description: 'Tags for the clip', required: false })
  readonly tags?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Clip type classification',
    enum: [
      'hook',
      'story',
      'tutorial',
      'reaction',
      'quote',
      'controversial',
      'educational',
    ],
    required: false,
  })
  readonly clipType?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'External provider job ID', required: false })
  readonly providerJobId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Avatar video provider name', required: false })
  readonly providerName?: string;

  @IsString()
  @IsOptional()
  @IsIn([...ClipResultStatus])
  @ApiProperty({
    description: 'Clip terminal processing status',
    enum: ClipResultStatus,
    enumName: 'ClipResultStatus',
    required: false,
  })
  readonly status?: string;

  @IsString()
  @IsOptional()
  @IsIn([...CLIP_RESULT_MODES])
  @ApiProperty({
    description: 'Clip generation mode (defaults to avatar)',
    enum: CLIP_RESULT_MODES,
    enumName: 'ClipResultMode',
    required: false,
  })
  readonly mode?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ description: 'Whether the clip is selected', required: false })
  readonly isSelected?: boolean;

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
