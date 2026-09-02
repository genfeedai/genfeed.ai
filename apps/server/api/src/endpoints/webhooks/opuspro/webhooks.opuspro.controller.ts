import { OpusProWebhookPayloadDto } from '@api/endpoints/webhooks/dto/opuspro-webhook-payload.dto';
import { OpusProWebhookService } from '@api/endpoints/webhooks/opuspro/webhooks.opuspro.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { assertWebhookToken } from '@api/webhooks/webhook-token.util';
import { IngredientCategory } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Public()
@Controller('webhooks/opuspro')
export class OpusProWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly opusProWebhookService: OpusProWebhookService,
    private readonly webhooksService: WebhooksService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleCallback(
    @Req() request: Request,
    @Body() payload: OpusProWebhookPayloadDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    assertWebhookToken({
      configuredSecret: this.configService.get('OPUSPRO_WEBHOOK_SECRET') as
        | string
        | undefined,
      loggerService: this.loggerService,
      request,
      secretEnvVar: 'OPUSPRO_WEBHOOK_SECRET',
      url,
    });

    if (
      payload == null ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      throw new BadRequestException('Webhook body is required');
    }

    try {
      this.loggerService.log(`${url} received`, payload);

      const callbackId = payload.callback_id;
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
