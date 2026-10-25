import {
  CLIPPER_DRAFT_SOURCE_KINDS,
  CLIPPER_RESULT_MODES,
  type ClipperDraftSourceKind,
  type ClipperResultMode,
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
export class UpdateClipperProjectDraftDto {
  @IsOptional()
  @IsIn(CLIPPER_DRAFT_SOURCE_KINDS)
  @ApiProperty({
    enum: CLIPPER_DRAFT_SOURCE_KINDS,
    enumName: 'ClipperDraftSourceKind',
    required: false,
  })
  readonly sourceKind?: ClipperDraftSourceKind;

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
  @IsIn([...CLIPPER_RESULT_MODES])
  @ApiProperty({
    enum: CLIPPER_RESULT_MODES,
    enumName: 'ClipperResultMode',
    required: false,
  })
  readonly mode?: ClipperResultMode;

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
