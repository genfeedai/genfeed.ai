import { KlingWebhookService } from '@api/endpoints/webhooks/klingai/webhooks.kling.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { IngredientCategory } from '@genfeedai/enums';
import { Public } from '@libs/decorators/public.decorator';
import type { KlingAIWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';

@AutoSwagger()
@Public()
@Controller('webhooks/klingai')
export class KlingWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly klingWebhookService: KlingWebhookService,
    private readonly webhooksService: WebhooksService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleCallback(@Body() payload: KlingAIWebhookPayload) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} received`, payload);

      // Handle metadata-based webhook processing if custom_id is present
      const customId = payload?.custom_id;
      if (customId) {
        await this.klingWebhookService.handleCallback(payload);
      }

      const externalId = payload.task_id;
      const status = payload.task_status;

      if (status === 'succeed') {
        const { imageUrls, videoUrls } =
          this.klingWebhookService.extractMediaUrls(payload.task_result);

        for (const imageUrl of imageUrls) {
          await this.webhooksService.processMediaFromWebhook(
            'klingai',
            IngredientCategory.IMAGE,
            externalId || '',
            imageUrl,
          );
        }

        for (const videoUrl of videoUrls) {
          await this.webhooksService.processMediaFromWebhook(
            'klingai',
            IngredientCategory.VIDEO,
            externalId || '',
            videoUrl,
          );
        }

        if (imageUrls.length === 0 && videoUrls.length === 0) {
          this.loggerService.warn(
            `${url} succeeded but no media URLs detected`,
            { payload },
          );
        }
      } else {
        // Handle failed generation
        const errorMessage = payload.task_error || 'Generation failed';
        await this.webhooksService.handleFailedGeneration(
          externalId || '',
          // @ts-expect-error TS2345
          errorMessage,
        );
      }

      return { message: 'Webhook processed successfully', success: true };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
