import {
  CLIP_DRAFT_SOURCE_KINDS,
  CLIP_RESULT_MODES,
  type ClipDraftSourceKind,
  type ClipResultMode,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Autosaved new-project form fields. Absent fields keep their saved value. */
export class UpdateClipProjectDraftDto {
  @IsOptional()
  @IsIn(CLIP_DRAFT_SOURCE_KINDS)
  @ApiProperty({
    enum: CLIP_DRAFT_SOURCE_KINDS,
    enumName: 'ClipDraftSourceKind',
    required: false,
  })
  readonly sourceKind?: ClipDraftSourceKind;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @ApiProperty({
    description: 'YouTube URL as typed; validated only when the project starts',
    required: false,
  })
  readonly youtubeUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({
    description: 'Picked upload filename; the file itself is not kept',
    required: false,
  })
  readonly filename?: string;

  @IsOptional()
  @IsIn([...CLIP_RESULT_MODES])
  @ApiProperty({
    enum: CLIP_RESULT_MODES,
    enumName: 'ClipResultMode',
    required: false,
  })
  readonly mode?: ClipResultMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  @ApiProperty({ required: false })
  readonly maxClips?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @ApiProperty({ required: false })
  readonly minViralityScore?: number;
}
