import { WebhookPayloadDto } from '@api/endpoints/webhooks/dto/webhook-payload.dto';
import type { ReplicateWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { ApiProperty } from '@nestjs/swagger';
import { Allow, IsString } from 'class-validator';

/**
 * Body of `POST /webhooks/replicate/callback`.
 *
 * `id` and `status` are required: every branch of the handler keys off them to
 * find the training, asset, or ingredient the callback belongs to, and a body
 * missing either cannot be routed at all.
 *
 * `version`, `model`, and `input` are read by the handler through the base index
 * signature. They are declared (as pass-through `@Allow()` fields) so the DTO
 * documents the real read surface, but deliberately carry no type constraint —
 * `model` in particular is only ever fed to a model lookup and a `@ts-expect-error`
 * guarded `split`, so narrowing it here would add rejection surface for drift
 * without making any handler safer.
 *
 * @see https://replicate.com/docs/webhooks
 */
export class ReplicateWebhookPayloadDto
  extends WebhookPayloadDto
  implements ReplicateWebhookPayload
{
  @IsString()
  @ApiProperty({ description: 'Replicate prediction id' })
  id!: string;

  @IsString()
  @ApiProperty({ description: 'Prediction lifecycle status' })
  status!: string;

  @Allow()
  @ApiProperty({ description: 'Prediction output', required: false })
  output?: unknown;

  @Allow()
  @ApiProperty({ description: 'Prediction error', required: false })
  error?: unknown;

  @Allow()
  @ApiProperty({ description: 'Trained model version', required: false })
  version?: unknown;

  @Allow()
  @ApiProperty({ description: 'Model key, `owner/name`', required: false })
  model?: unknown;

  @Allow()
  @ApiProperty({ description: 'Prediction input', required: false })
  input?: unknown;
}
