import { WorkflowWebhookAuthType } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

/**
 * DTO for the collapsed webhook-config PATCH.
 *
 * Replaces the former `POST /workflows/:id/webhook/regenerate-secret` RPC
 * route (#1354). `rotateSecret: true` regenerates the webhook secret in place;
 * the 'webhook not configured' guard is preserved in the controller.
 */
export class PatchWorkflowWebhookDto {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Rotate (regenerate) the webhook secret in place',
    required: false,
  })
  readonly rotateSecret?: boolean;
}

/**
 * DTO for `POST /workflows/:workflowId/webhook`.
 *
 * Previously an inline `{ authType?: 'none' | 'secret' | 'bearer' }` body
 * type with no runtime validation — the global `ValidationPipe` never saw a
 * class to validate against, so any string (e.g. `'Secret'` or `'hmac'`)
 * passed straight through, got persisted as `webhookAuthType`, and the
 * public trigger endpoint then skipped auth entirely for that value (see
 * genfeedai/genfeed.ai#5248). `@IsEnum` now rejects anything outside
 * `WorkflowWebhookAuthType` with a 400 before it ever reaches the service.
 */
export class GenerateWorkflowWebhookDto {
  @IsEnum(WorkflowWebhookAuthType)
  @IsOptional()
  @ApiProperty({
    description: 'Webhook authentication mode',
    enum: WorkflowWebhookAuthType,
    required: false,
  })
  readonly authType?: WorkflowWebhookAuthType;
}
