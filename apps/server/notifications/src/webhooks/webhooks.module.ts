import { EventsModule } from '@libs/events/events.module';
import { Module } from '@nestjs/common';
import { InternalApiKeyGuard } from '@notifications/guards/internal-api-key.guard';
import { SharedModule } from '@notifications/shared/shared.module';
import { WebhooksController } from '@notifications/webhooks/webhooks.controller';
import { WebhooksService } from '@notifications/webhooks/webhooks.service';

@Module({
  controllers: [WebhooksController],
  exports: [WebhooksService],
  imports: [EventsModule, SharedModule],
  providers: [InternalApiKeyGuard, WebhooksService],
})
export class WebhooksModule {}
