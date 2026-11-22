import { randomUUID } from 'node:crypto';
import { StripeWebhookBillingError } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.error';
import { StripeWebhookBillingExceptionFilter } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing-exception.filter';
import {
  getStripeWebhookErrorDiagnostics,
  mapStripeWebhookError,
  StripeWebhookErrorKind,
  toStripeWebhookException,
} from '@api/endpoints/webhooks/stripe/stripe-webhook-error.util';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import {
  RELEASE_OWNED_CLAIM_SCRIPT,
  SET_OWNED_CLAIM_VALUE_SCRIPT,
} from '@api/services/cache/cache-claim-scripts';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { SystemEventsService } from '@api/services/system-events/system-events.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, HttpCode, Post, Req, UseFilters } from '@nestjs/common';
import type { Request } from 'express';
import type Redis from 'ioredis';
import type Stripe from 'stripe';

/** TTL for a finished event's idempotency key (24 hours) */
const WEBHOOK_IDEMPOTENCY_TTL = 86400;
/**
 * TTL for an event whose handler is still running. Longer than the handler
 * budget, short enough that an event whose process died is processable again
 * on Stripe's next retry instead of being suppressed for a day.
 */
const WEBHOOK_IN_PROGRESS_TTL = 300;
const IN_PROGRESS_PREFIX = 'in-progress:';

@AutoSwagger()
@Public()
@UseFilters(StripeWebhookBillingExceptionFilter)
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly redisService: RedisService,
    private readonly stripeService: StripeService,

    private readonly stripeWebhookService: StripeWebhookService,
    private readonly systemEvents: SystemEventsService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleStripe(@Req() request: Request) {
    if (isSelfHostedDeployment()) throw new NotFoundException('Route');

    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    let event: Stripe.Event | undefined;
    let idempotencyKey: string | null = null;
    let claimToken: string | null = null;
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

      // Persist verified provider activity before billing side effects or replay suppression.
      await this.systemEvents.recordStripeEvent(event);

      // Idempotency: skip if this event was already processed
      idempotencyKey = `stripe:webhook:${event.id}`;

      if (publisher) {
        // Atomic SET NX: GET-then-SETEX was a TOCTOU race — two concurrent
        // deliveries of the same event both saw null and both processed. The
        // value says who holds the claim and that the handler is still
        // running; it is promoted to a 24 hour "done" marker only after the
        // handler succeeds.
        const token = `${IN_PROGRESS_PREFIX}${randomUUID()}`;
        const acquired = await publisher.set(
          idempotencyKey,
          token,
          'EX',
          WEBHOOK_IN_PROGRESS_TTL,
          'NX',
        );

        if (!acquired) {
          const existing = await publisher.get(idempotencyKey);

          // Done (or a marker written before in-progress claims existed):
          // acknowledge. Anything else means another delivery is mid-flight or
          // the claim just expired; acknowledging would tell Stripe the event
          // is processed when it may not be, so ask it to retry.
          if (existing?.startsWith(IN_PROGRESS_PREFIX) || existing === null) {
            this.loggerService.warn(
              `${url} event claim held by another delivery`,
              {
                id: event.id,
                type: event.type,
              },
            );
            throw new StripeWebhookBillingError('claim_in_flight');
          }

          this.loggerService.log(`${url} duplicate event skipped`, {
            id: event.id,
            kind: StripeWebhookErrorKind.IDEMPOTENT,
            type: event.type,
          });
          return { success: true };
        }

        claimToken = token;
      }

      await this.stripeWebhookService.handleWebhookEvent(event, url);
      await this.markEventProcessed(publisher, idempotencyKey, claimToken, url);
    } catch (error: unknown) {
      const mapping = mapStripeWebhookError(error);
      const diagnostics = getStripeWebhookErrorDiagnostics(error, event);

      if (publisher && claimToken && idempotencyKey) {
        if (mapping.shouldAcknowledge) {
          // Acknowledged with 2xx: Stripe will not retry, so the event is done.
          await this.markEventProcessed(
            publisher,
            idempotencyKey,
            claimToken,
            url,
          );
        } else if (mapping.shouldReleaseIdempotencyKey) {
          await this.releaseEventClaim(
            publisher,
            idempotencyKey,
            claimToken,
            url,
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

  /** Promote the in-progress claim to the 24 hour done marker, only while this delivery still owns it. */
  private async markEventProcessed(
    publisher: Redis | null,
    key: string | null,
    token: string | null,
    url: string,
  ): Promise<void> {
    if (!publisher || !key || !token) return;

    try {
      const promoted = await publisher.eval(
        SET_OWNED_CLAIM_VALUE_SCRIPT,
        2,
        key,
        key,
        token,
        new Date().toISOString(),
        WEBHOOK_IDEMPOTENCY_TTL,
      );

      if (promoted !== 1) {
        this.loggerService.warn(
          `${url} event claim expired before it was marked processed`,
          { key },
        );
      }
    } catch (error: unknown) {
      // The handler already succeeded; the claim expires and a redelivery is
      // absorbed by the Postgres-level idempotency of the handlers.
      this.loggerService.error(
        `${url} failed to mark event as processed`,
        error,
      );
    }
  }

  /** Delete the claim so Stripe's retry is processed, only while this delivery still owns it. */
  private async releaseEventClaim(
    publisher: Redis,
    key: string,
    token: string,
    url: string,
  ): Promise<void> {
    try {
      await publisher.eval(RELEASE_OWNED_CLAIM_SCRIPT, 1, key, token);
    } catch (cleanupError: unknown) {
      this.loggerService.error(
        `${url} failed to release idempotency key after processing failure`,
        cleanupError,
      );
    }
  }
}
