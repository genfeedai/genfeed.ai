import { WebhookPayloadDto } from '@api/endpoints/webhooks/dto/webhook-payload.dto';
import type { HeygenWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Body of `POST /webhooks/heygen/callback`.
 *
 * Every field is optional: Heygen fans several event types through one callback
 * URL and the service already branches on what is present. `event_data` is
 * checked at the container level only — the handler reads `callback_id`,
 * `video_id`, `url`, and `video_url` off it defensively, and the whole body is
 * spread into the microservices notification, so its inner keys must survive.
 */
export class HeygenWebhookPayloadDto
  extends WebhookPayloadDto
  implements HeygenWebhookPayload
{
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Heygen event type', required: false })
  event_type?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Event body for this event type',
    required: false,
  })
  event_data?: HeygenWebhookPayload['event_data'];

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Correlation id sent on the job',
    required: false,
  })
  callback_id?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Heygen video id', required: false })
  video_id?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Video lifecycle status', required: false })
  status?: string;
}
