import {
  ORGANIZATION_WEBHOOK_EVENT_TYPES,
  type OrganizationWebhookEventType,
} from '@genfeedai/contracts/api-types/contracts/webhook-events.contract';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class TestOrganizationWebhookDto {
  @IsIn(ORGANIZATION_WEBHOOK_EVENT_TYPES)
  @IsOptional()
  @ApiProperty({
    description:
      'Webhook event type to use for the sample test payload. Defaults to the first configured event filter or target.published.',
    enum: ORGANIZATION_WEBHOOK_EVENT_TYPES,
    required: false,
  })
  readonly event?: OrganizationWebhookEventType;
}
