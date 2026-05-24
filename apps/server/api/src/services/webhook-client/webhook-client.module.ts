import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { WebhookClientProcessor } from '@api/services/webhook-client/webhook-client.processor';
import { WebhookClientService } from '@api/services/webhook-client/webhook-client.service';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [WebhookClientService],
  imports: [
    forwardRef(() => HttpModule),
    forwardRef(() => OrganizationSettingsModule),
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          delay: 3000,
          type: 'exponential',
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
      name: 'webhook-client',
    }),
  ],
  providers: [WebhookClientService, WebhookClientProcessor],
})
export class WebhookClientModule {}
