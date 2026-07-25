import { WebhookPayloadDto } from '@api/endpoints/webhooks/dto/webhook-payload.dto';
import type { FleetVoiceCloneWebhookPayload } from '@api/endpoints/webhooks/fleet/webhooks.fleet.service';
import { ApiProperty } from '@nestjs/swagger';
import {
  Allow,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Body of `POST /webhooks/fleet/voice-clone`.
 *
 * The Fleet worker has shipped several naming conventions over time, so the
 * service reads every casing alias for the job id, status, timing, and sample
 * URL and falls back between them. All of them are declared rather than
 * normalised here — normalising in the DTO would change what the service sees
 * and is a separate refactor from closing the validation gap.
 *
 * Numeric timing fields carry a real `@IsNumber()` check: unlike the third-party
 * providers, Fleet is first-party, so its payload contract is ours to keep and a
 * string here would be a bug worth surfacing rather than drift to tolerate.
 */
export class FleetVoiceCloneWebhookPayloadDto
  extends WebhookPayloadDto
  implements FleetVoiceCloneWebhookPayload
{
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Asset the clone belongs to', required: false })
  assetId?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Sample duration', required: false })
  duration?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Sample duration, seconds', required: false })
  durationSeconds?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Sample duration, seconds, snake_case',
    required: false,
  })
  duration_seconds?: number;

  @Allow()
  @ApiProperty({ description: 'Failure detail', required: false })
  error?: unknown;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Voice handle', required: false })
  handle?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Fleet record id', required: false })
  id?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Ingredient the clone belongs to',
    required: false,
  })
  ingredientId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Job id, snake_case', required: false })
  job_id?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Job id, camelCase', required: false })
  jobId?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({ description: 'Run metrics', required: false })
  metrics?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiProperty({ description: 'Job output', required: false })
  output?: Record<string, unknown>;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Processing time, snake_case', required: false })
  process_time?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Processing time in seconds, snake_case',
    required: false,
  })
  process_time_seconds?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Processing time', required: false })
  processTime?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Processing time in milliseconds',
    required: false,
  })
  processTimeMs?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Processing time in seconds', required: false })
  processTimeSeconds?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Processing time, legacy snake_case',
    required: false,
  })
  processing_time?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Processing time, legacy camelCase',
    required: false,
  })
  processingTime?: number;

  @IsObject()
  @IsOptional()
  @ApiProperty({ description: 'Job result', required: false })
  result?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Sample audio URL, camelCase', required: false })
  sampleAudioUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Sample audio URL, snake_case', required: false })
  sample_audio_url?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Job state alias', required: false })
  state?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Job status', required: false })
  status?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Cloned voice id, snake_case', required: false })
  voice_id?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Cloned voice id, camelCase', required: false })
  voiceId?: string;
}
