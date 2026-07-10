import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { ConfigService } from '@libs/config/config.service';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
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
    private readonly configService: ConfigService,
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
    let idempotencyKey: string | null = null;
    let idempotencyKeyAcquired = false;
    const publisher = this.redisService.getPublisher();

    try {
      const rawBody = request.body;
      const secret = this.configService.get('STRIPE_WEBHOOK_SIGNING_SECRET');
      let event: Stripe.Event;

      const signature = request.headers['stripe-signature'] as string;

      try {
        event = await this.stripeService.stripe.webhooks.constructEventAsync(
          rawBody,
          signature,
          // @ts-expect-error TS2345
          secret,
        );

        this.loggerService.log(`${url} webhook validated`, {
          id: event.id,
          type: event.type,
        });
      } catch (error: unknown) {
        this.loggerService.error(`${url} invalid signature`, error);
        throw new BadRequestException('Invalid Stripe signature');
      }

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
            type: event.type,
          });
          return { success: true };
        }

        idempotencyKeyAcquired = true;
      }

      await this.stripeWebhookService.handleWebhookEvent(event, url);
    } catch (error: unknown) {
      if (publisher && idempotencyKeyAcquired && idempotencyKey) {
        try {
          await publisher.del(idempotencyKey);
        } catch (cleanupError: unknown) {
          this.loggerService.error(
            `${url} failed to release idempotency key after processing failure`,
            cleanupError,
          );
        }
      }

      this.loggerService.error(`${url} processing failed`, error);

      throw new HttpException(
        'Webhook processing failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return { success: true };
  }
}
