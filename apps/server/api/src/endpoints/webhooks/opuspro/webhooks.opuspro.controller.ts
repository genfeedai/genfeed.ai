import { OpusProWebhookService } from '@api/endpoints/webhooks/opuspro/webhooks.opuspro.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { IngredientCategory } from '@genfeedai/enums';
import { Public } from '@libs/decorators/public.decorator';
import { OpusProWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';

@AutoSwagger()
@Public()
@Controller('webhooks/opuspro')
export class OpusProWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly opusProWebhookService: OpusProWebhookService,
    private readonly webhooksService: WebhooksService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleCallback(@Body() payload: OpusProWebhookPayload) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} received`, payload);

      const callbackId = payload?.callback_id;
      if (callbackId) {
        await this.opusProWebhookService.handleCallback(payload);
      }

      const status = payload.status;
      const videoUrl = this.opusProWebhookService.extractVideoUrl(payload);

      if (status === 'completed' && videoUrl && callbackId) {
        await this.webhooksService.processMediaFromWebhook(
          'opuspro',
          IngredientCategory.VIDEO,
          callbackId,
          videoUrl,
        );
      } else if (status === 'failed' && callbackId) {
        await this.webhooksService.handleFailedGeneration(
          callbackId,
          payload.error || 'Opus Pro generation failed',
        );
      }

      return { detail: 'Webhook received' };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
