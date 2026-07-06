import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

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
