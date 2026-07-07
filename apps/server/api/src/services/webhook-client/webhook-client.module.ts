import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
import { WebhookClientService } from '@api/services/webhook-client/webhook-client.service';
import { WEBHOOK_CLIENT_QUEUE } from '@genfeedai/queue-contracts';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

export { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';

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
  exports: [PublishEventWebhookService, WebhookClientService],
  imports: [
    forwardRef(() => HttpModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => PostsModule),
    BullModule.registerQueue({
      defaultJobOptions: WEBHOOK_CLIENT_DEFAULT_JOB_OPTIONS,
      name: WEBHOOK_CLIENT_QUEUE,
    }),
  ],
  providers: [PublishEventWebhookService, WebhookClientService],
})
export class WebhookClientModule {}
