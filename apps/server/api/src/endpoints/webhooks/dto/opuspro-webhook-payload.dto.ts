import { WebhookPayloadDto } from '@api/endpoints/webhooks/dto/webhook-payload.dto';
import type { OpusProWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Body of `POST /webhooks/opuspro/callback`.
 *
 * Opus Pro sends the clip URL under either `videoUrl` or `video_url` depending
 * on the job type, so both are declared and the handler falls back between them.
 * The whole body is spread into the microservices notification, which is why the
 * base DTO's pass-through behaviour matters here.
 */
export class OpusProWebhookPayloadDto
  extends WebhookPayloadDto
  implements OpusProWebhookPayload
{
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Correlation id sent on the job',
    required: false,
  })
  callback_id?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Clip lifecycle status', required: false })
  status?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Rendered clip URL, camelCase', required: false })
  videoUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Rendered clip URL, snake_case',
    required: false,
  })
  video_url?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Failure detail', required: false })
  error?: string;
}
