import {
  PUBLISH_WEBHOOK_EVENT_TYPES,
  type PublishWebhookEventType,
} from '@api-types/contracts/publish-webhook-events.contract';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class TestOrganizationWebhookDto {
  @IsIn(PUBLISH_WEBHOOK_EVENT_TYPES)
  @IsOptional()
  @ApiProperty({
    description:
      'Publish webhook event type to use for the sample test payload. Defaults to the first configured event filter or target.published.',
    enum: PUBLISH_WEBHOOK_EVENT_TYPES,
    required: false,
  })
  readonly event?: PublishWebhookEventType;
}
