import { EventsModule } from '@libs/events/events.module';
import { Module } from '@nestjs/common';
import { WebhooksController } from '@notifications/webhooks/webhooks.controller';
import { WebhooksService } from '@notifications/webhooks/webhooks.service';

@Module({
  controllers: [WebhooksController],
  exports: [WebhooksService],
  imports: [EventsModule],
  providers: [WebhooksService],
})
export class WebhooksModule {}
