import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { WebhookNotification } from '@notifications/shared/interfaces/webhooks.interface';
import { WebhooksService } from '@notifications/webhooks/webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @HttpCode(200)
  @Post('notify')
  async notify(@Body() notification: WebhookNotification) {
    await this.webhooksService.handleWebhookNotification(notification);
    return { message: 'Notification received', success: true };
  }

  @Get('status/:service/:webhookId')
  getStatus(
    @Param('service') service: string,
    @Param('webhookId') webhookId: string,
  ) {
    return this.webhooksService.getWebhookStatus(service, webhookId);
  }
}
