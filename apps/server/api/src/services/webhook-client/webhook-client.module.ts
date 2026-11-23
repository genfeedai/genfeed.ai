import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { ServerFunnelCaptureModule } from '@api/services/analytics/server-funnel-capture.module';
import { GenerationEventWebhookService } from '@api/services/webhook-client/generation-event-webhook.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
import { WebhookDispatchService } from '@api/services/webhook-client/webhook-dispatch.service';
import { WorkflowEventWebhookService } from '@api/services/webhook-client/workflow-event-webhook.service';
import { WEBHOOK_CLIENT_QUEUE } from '@genfeedai/contracts/queue';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

export { WebhookDispatchService } from '@api/services/webhook-client/webhook-dispatch.service';
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
    WebhookDispatchService,
    WorkflowEventWebhookService,
  ],
  imports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    OrganizationSettingsModule,
    PostsCoreModule,
    ServerFunnelCaptureModule,
    BullModule.registerQueue({
      defaultJobOptions: WEBHOOK_CLIENT_DEFAULT_JOB_OPTIONS,
      name: WEBHOOK_CLIENT_QUEUE,
    }),
  ],
  providers: [
    GenerationEventWebhookService,
    PublishEventWebhookService,
    WebhookDispatchService,
    WorkflowEventWebhookService,
  ],
})
export class WebhookClientModule {}
