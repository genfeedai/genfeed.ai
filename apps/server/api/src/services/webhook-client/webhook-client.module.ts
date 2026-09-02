import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { GenerationEventWebhookService } from '@api/services/webhook-client/generation-event-webhook.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
import { WebhookClientService } from '@api/services/webhook-client/webhook-client.service';
import { WebhookDispatchService } from '@api/services/webhook-client/webhook-dispatch.service';
import { WorkflowEventWebhookService } from '@api/services/webhook-client/workflow-event-webhook.service';
import { WEBHOOK_CLIENT_QUEUE } from '@genfeedai/contracts/queue';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

export { GenerationEventWebhookService } from '@api/services/webhook-client/generation-event-webhook.service';
export { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
export { WebhookDispatchService } from '@api/services/webhook-client/webhook-dispatch.service';
export { WorkflowEventWebhookService } from '@api/services/webhook-client/workflow-event-webhook.service';

export const WEBHOOK_CLIENT_DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    delay: 3000,
    type: 'exponential',
  },
  removeOnComplete: 100,
  removeOnFail: 200,
} as const;

@Module({
  exports: [
    GenerationEventWebhookService,
    PublishEventWebhookService,
    WebhookClientService,
    WebhookDispatchService,
    WorkflowEventWebhookService,
  ],
  imports: [
    HttpModule,
    OrganizationSettingsModule,
    PostsCoreModule,
    BullModule.registerQueue({
      defaultJobOptions: WEBHOOK_CLIENT_DEFAULT_JOB_OPTIONS,
      name: WEBHOOK_CLIENT_QUEUE,
    }),
  ],
  providers: [
    GenerationEventWebhookService,
    PublishEventWebhookService,
    WebhookClientService,
    WebhookDispatchService,
    WorkflowEventWebhookService,
  ],
})
export class WebhookClientModule {}
