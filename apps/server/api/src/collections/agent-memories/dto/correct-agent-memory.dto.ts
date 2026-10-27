import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const AGENT_MEMORY_CONTENT_MAX = 20_000;
export const AGENT_MEMORY_REASON_MAX = 2_000;
export const AGENT_MEMORY_SUMMARY_MAX = 500;
export const AGENT_MEMORY_TAGS_MAX = 50;
export const AGENT_MEMORY_TAG_MAX = 64;

/**
 * Body of a memory correction. Who is correcting, in which organization and at
 * what scope all come from the authenticated request, never from the body.
 */
export class CorrectAgentMemoryDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @ApiProperty({ description: 'The corrected memory text' })
  @IsString()
  @MinLength(1)
  @MaxLength(AGENT_MEMORY_CONTENT_MAX)
  content!: string;

  @ApiProperty({
    description:
      'The revision id the caller read. A stale value is refused with 409.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  expectedRevisionId!: string;

  @ApiProperty({ description: 'Why the memory is being corrected' })
  @IsString()
  @MinLength(1)
  @MaxLength(AGENT_MEMORY_REASON_MAX)
  reason!: string;

  @ApiProperty({
    description:
      'Idempotency key. Repeating a request with the same key returns the same revision.',
  })
  @IsUUID()
  requestId!: string;

  @ApiProperty({ maximum: 1, minimum: 0, required: false })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1)
  importance?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(AGENT_MEMORY_SUMMARY_MAX)
  summary?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(AGENT_MEMORY_TAGS_MAX)
  @IsString({ each: true })
  @MaxLength(AGENT_MEMORY_TAG_MAX, { each: true })
  tags?: string[];
}
