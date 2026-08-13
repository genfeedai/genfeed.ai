import { HeygenWebhookService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.service';
import { HeygenWebhookVerificationService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.verification.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { Public } from '@libs/decorators/public.decorator';
import type { HeygenWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Public()
@Controller('webhooks/heygen')
export class HeygenWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly heygenWebhookService: HeygenWebhookService,
    private readonly heygenWebhookVerificationService: HeygenWebhookVerificationService,
  ) {}

  /**
   * Receives deliveries for the endpoint registered with HeyGen.
   *
   * The URL registered there is bare — authenticity comes from the signature
   * over the body, not from anything in the request line. `main.ts` mounts
   * `express.raw` on this path so the bytes reach us exactly as they were
   * signed; the body is parsed only after the signature has been checked.
   */
  @HttpCode(200)
  @Post('callback')
  async handleCallback(@Req() request: Request) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const rawBody = request.body;

    if (!Buffer.isBuffer(rawBody)) {
      this.loggerService.error(
        `${url} rejected — body was parsed before verification, signature cannot be checked`,
      );
      throw new BadRequestException('Raw webhook body is required');
    }

    this.heygenWebhookVerificationService.assertSignature(
      rawBody,
      request.headers['heygen-signature'],
      request.headers['heygen-timestamp'],
    );

    if (
      await this.heygenWebhookVerificationService.isReplay(
        request.headers['heygen-event-id'],
      )
    ) {
      return { detail: 'Webhook already processed' };
    }

    const payload = this.parsePayload(rawBody, url);

    try {
      this.loggerService.log(`${url} received`, payload);

      await this.heygenWebhookService.handleCallback(payload);

      return { detail: 'Webhook received' };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      // The replay claim was taken before processing; releasing it here lets
      // HeyGen's retry (same event id) be processed instead of being
      // suppressed as "already processed" for the whole replay window.
      await this.heygenWebhookVerificationService.releaseReplayClaim(
        request.headers['heygen-event-id'],
      );
      throw error;
    }
  }

  private parsePayload(rawBody: Buffer, url: string): HeygenWebhookPayload {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawBody.toString());
    } catch (error: unknown) {
      this.loggerService.error(`${url} body is not valid JSON`, error);
      throw new BadRequestException('Webhook body must be valid JSON');
    }

    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException('Webhook body is required');
    }

    return parsed as HeygenWebhookPayload;
  }
}
