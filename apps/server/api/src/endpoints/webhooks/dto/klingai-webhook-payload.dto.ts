import { WebhookPayloadDto } from '@api/endpoints/webhooks/dto/webhook-payload.dto';
import type { KlingAIWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { ApiProperty } from '@nestjs/swagger';
import { Allow, IsOptional, IsString } from 'class-validator';

/**
 * Body of `POST /webhooks/klingai/callback`.
 *
 * `custom_id`, `task_result`, and `task_error` are read by the controller and
 * service through the base index signature rather than the interface. They are
 * declared here as pass-through `@Allow()` fields so the DTO records the real
 * read surface. `task_result` in particular must stay untyped and unstripped:
 * `extractMediaUrls` walks it recursively for URLs at arbitrary depth, so any
 * nested modelling would drop the URLs the handler exists to find.
 */
export class KlingAIWebhookPayloadDto
  extends WebhookPayloadDto
  implements KlingAIWebhookPayload
{
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'KlingAI task id', required: false })
  task_id?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Task lifecycle status', required: false })
  task_status?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Correlation id sent on the job',
    required: false,
  })
  custom_id?: string;

  @Allow()
  @ApiProperty({ description: 'Task result tree', required: false })
  task_result?: unknown;

  @Allow()
  @ApiProperty({ description: 'Task failure detail', required: false })
  task_error?: unknown;
}
