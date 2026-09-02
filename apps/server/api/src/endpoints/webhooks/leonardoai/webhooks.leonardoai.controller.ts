import { LeonardoAIWebhookPayloadDto } from '@api/endpoints/webhooks/dto/leonardoai-webhook-payload.dto';
import { parseAllowedIps } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.constants';
import { LeonardoaiWebhookService } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { assertWebhookToken } from '@api/webhooks/webhook-token.util';
import { IngredientCategory } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Public()
@Controller('webhooks/leonardoai')
export class LeonardoaiWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly leonardoaiWebhookService: LeonardoaiWebhookService,
    private readonly webhooksService: WebhooksService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleCallback(
    @Req() request: Request,
    @Body() payload: LeonardoAIWebhookPayloadDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const configuredSecret = this.configService.get(
      'LEONARDO_WEBHOOK_SECRET',
    ) as string | undefined;

    // Leonardo.AI has no HMAC scheme; it presents the webhook callback API key
    // registered against the production API key as `Authorization: Bearer`.
    // @Public() short-circuits CombinedAuthGuard, so that header reaches us
    // untouched.
    assertWebhookToken({
      acceptBearerHeader: true,
      configuredSecret,
      loggerService: this.loggerService,
      request,
      secretEnvVar: 'LEONARDO_WEBHOOK_SECRET',
      url,
    });

    // request.ip is derived safely by Express under `trust proxy 1`.
    // Reading x-forwarded-for directly is spoofable: an attacker sends
    // 'X-Forwarded-For: <allowed-ip>, <self>' and the first-token split
    // yields the allowed IP.
    const requestIp: string = request.ip || '';

    this.assertAllowedIp(requestIp);

    try {
      this.loggerService.log(`${url} received`, payload);

      // Handle metadata-based webhook processing if customId is present
      const customId = payload?.customId;
      if (customId) {
        await this.leonardoaiWebhookService.handleCallback(payload);
      }

      const type = payload.type;
      const generation = payload.data?.object;

      // The vendor envelope is not contractual — a payload without
      // `data.object` is logged and acknowledged rather than thrown, so a
      // shape change never turns into a 500 and a vendor retry storm.
      if (!generation) {
        this.loggerService.warn(`${url} payload missing data.object`, { type });

        return { message: 'Webhook payload ignored', success: false };
      }

      const generatedId = generation.id;
      const images = Array.isArray(generation.images) ? generation.images : [];

      this.loggerService.log('Received webhook from LeonardoAI', {
        generatedId,
        type,
      });

      if (type === 'image-generation.complete' && generatedId) {
        const generatedImage = images.find(
          (image) => image?.generationId === generatedId,
        );

        if (generatedImage?.url) {
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

  /**
   * Defence in depth on top of the shared secret. Leonardo rotates its egress
   * addresses without notice, so the allowlist lives in config and is only
   * enforced when a deployment opts in via `LEONARDO_WEBHOOK_ALLOWED_IPS`.
   *
   * There is no longer a hard-coded fallback list: it only ever applied when
   * `LEONARDO_WEBHOOK_SECRET` was unset, and that path now fails closed in
   * `assertWebhookToken` before this runs. A stale IP list is a worse gate than
   * the secret it was standing in for.
   */
  private assertAllowedIp(requestIp: string): void {
    const allowedIps = parseAllowedIps(
      this.configService.get('LEONARDO_WEBHOOK_ALLOWED_IPS') as
        | string
        | undefined,
    );

    if (allowedIps.length === 0) {
      return;
    }

    if (!allowedIps.includes(requestIp)) {
      this.loggerService.warn(
        `Unauthorized webhook request from IP: ${requestIp}`,
      );
      throw new UnauthorizedException('Unauthorized webhook request');
    }
  }
}
