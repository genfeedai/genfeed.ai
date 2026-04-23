import { LeonardoaiWebhookService } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { IngredientCategory } from '@genfeedai/enums';
import { Public } from '@libs/decorators/public.decorator';
import { LeonardoAIWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Public()
@Controller('webhooks/leonardoai')
export class LeonardoaiWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly leonardoaiWebhookService: LeonardoaiWebhookService,
    private readonly webhooksService: WebhooksService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleCallback(
    @Req() request: Request,
    @Body() payload: LeonardoAIWebhookPayload,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} received`, payload);
      const requestIp: string =
        request.headers['x-forwarded-for']?.toString().split(',')[0] ||
        request.ip ||
        '';

      // Verify that the request is coming from LeonardoAI's IP addresses
      const allowedIps = [
        '35.173.108.170',
        '34.239.69.60',
        '52.73.75.186',
        '3.229.99.26',
        '44.218.0.197',
        '174.129.230.221',
      ];

      if (!allowedIps.includes(requestIp)) {
        this.loggerService.warn(
          `Unauthorized webhook request from IP: ${requestIp}`,
        );
        throw new Error('Unauthorized webhook request');
      }

      // Handle metadata-based webhook processing if customId is present
      const customId = payload?.customId;
      if (customId) {
        await this.leonardoaiWebhookService.handleCallback(payload);
      }

      const type = payload.type;
      // @ts-expect-error TS2571
      const images = (
        payload.data as Record<string, unknown> as Record<string, unknown>
      ).object.images;
      // @ts-expect-error TS2571
      const generatedId = (
        payload.data as Record<string, unknown> as Record<string, unknown>
      ).object.id;

      this.loggerService.log('Received webhook from LeonardoAI', {
        generatedId,
        type,
      });

      if (type === 'image-generation.complete') {
        const generatedImage = images.find(
          (image: unknown) =>
            typeof image === 'object' &&
            image !== null &&
            'generationId' in image &&
            image.generationId === generatedId,
        );

        if (generatedImage) {
          await this.webhooksService.processMediaFromWebhook(
            'leonardoai',
            IngredientCategory.IMAGE,
            generatedId,
            generatedImage.url,
          );
        }
      }

      return { message: 'Webhook processed successfully', success: true };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
