import { StripeWebhookBillingError } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.error';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch(StripeWebhookBillingError)
export class StripeWebhookBillingExceptionFilter
  implements ExceptionFilter<StripeWebhookBillingError>
{
  catch(exception: StripeWebhookBillingError, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(503)
      .json({
        errors: [
          {
            status: '503',
            title: 'Service Unavailable',
            detail: exception.message,
            code: exception.code,
          },
        ],
      });
  }
}
