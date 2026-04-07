import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { WebhookClientService } from '@api/services/webhook-client/webhook-client.service';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [WebhookClientService],
  imports: [
    HttpModule,
    OrganizationSettingsModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          delay: 3000, // Start with 3s, then 6s, 12s, 24s, 48s
          type: 'exponential',
        },
        removeOnComplete: 100,
        removeOnFail: 200, // Keep more failed jobs for debugging
      },
      name: 'webhook-client',
    }),
  ],
  // WebhookClientProcessor moved to workers ProcessorsModule (issue #84)
  providers: [WebhookClientService],
})
export class WebhookClientModule {}
