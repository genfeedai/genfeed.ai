import {
  getStripeWebhookErrorDiagnostics,
  mapStripeWebhookError,
  StripeWebhookErrorKind,
  toStripeWebhookException,
} from '@api/endpoints/webhooks/stripe/stripe-webhook-error.util';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';

/** TTL for webhook idempotency keys (24 hours) */
const WEBHOOK_IDEMPOTENCY_TTL = 86400;

@AutoSwagger()
@Public()
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly redisService: RedisService,
    private readonly stripeService: StripeService,

    private readonly stripeWebhookService: StripeWebhookService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleStripe(@Req() request: Request) {
    if (isSelfHostedDeployment()) throw new NotFoundException('Route');

    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    let event: Stripe.Event | undefined;
    let idempotencyKey: string | null = null;
    let idempotencyKeyAcquired = false;
    const publisher = this.redisService.getPublisher();

    try {
      event = await this.stripeService.constructWebhookEvent(
        request.body,
        request.headers['stripe-signature'] as string | undefined,
      );

      this.loggerService.log(`${url} webhook validated`, {
        id: event.id,
        type: event.type,
      });

      // Idempotency: skip if this event was already processed
      idempotencyKey = `stripe:webhook:${event.id}`;

      if (publisher) {
        // Atomic SET NX: GET-then-SETEX was a TOCTOU race — two concurrent
        // deliveries of the same event both saw null and both processed.
        const acquired = await publisher.set(
          idempotencyKey,
          new Date().toISOString(),
          'EX',
          WEBHOOK_IDEMPOTENCY_TTL,
          'NX',
        );

        if (!acquired) {
          this.loggerService.log(`${url} duplicate event skipped`, {
            id: event.id,
            kind: StripeWebhookErrorKind.IDEMPOTENT,
            type: event.type,
          });
          return { success: true };
        }

        idempotencyKeyAcquired = true;
      }

      await this.stripeWebhookService.handleWebhookEvent(event, url);
    } catch (error: unknown) {
      const mapping = mapStripeWebhookError(error);
      const diagnostics = getStripeWebhookErrorDiagnostics(error, event);

      if (
        mapping.shouldReleaseIdempotencyKey &&
        publisher &&
        idempotencyKeyAcquired &&
        idempotencyKey
      ) {
        try {
          await publisher.del(idempotencyKey);
        } catch (cleanupError: unknown) {
          this.loggerService.error(
            `${url} failed to release idempotency key after processing failure`,
            cleanupError,
          );
        }
      }

      if (mapping.shouldAcknowledge) {
        this.loggerService.warn(
          `${url} webhook ${mapping.kind.toLowerCase()} acknowledged`,
          diagnostics,
        );
        return { success: true };
      }

      if (mapping.shouldReportAsFault) {
        this.loggerService.error(
          `${url} processing failed`,
          error,
          diagnostics,
        );
        throw error;
      }

      this.loggerService.warn(
        `${url} webhook ${mapping.kind.toLowerCase()} rejected`,
        diagnostics,
      );
      throw toStripeWebhookException(error);
    }

    return { success: true };
  }
}
