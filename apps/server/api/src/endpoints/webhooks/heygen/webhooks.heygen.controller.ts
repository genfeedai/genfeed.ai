import { HeygenWebhookService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { Public } from '@libs/decorators/public.decorator';
import type { HeygenWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';

@AutoSwagger()
@Public()
@Controller('webhooks/heygen')
export class HeygenWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly heygenWebhookService: HeygenWebhookService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleCallback(@Body() payload: HeygenWebhookPayload) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} received`, payload);

      await this.heygenWebhookService.handleCallback(payload);

      return { detail: 'Webhook received' };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
