import { StripeAttributionTrackerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-attribution-tracker.service';
import { StripeCheckoutWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-checkout-webhook.handler';
import { StripeCustomerWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-customer-webhook.handler';
import { StripeInvoiceWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler';
import { StripeSubscriptionWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { StripeWebhooksModule } from '@api/endpoints/webhooks/stripe/stripe-webhooks.module';
import { StripeWebhookController } from '@api/endpoints/webhooks/stripe/webhooks.stripe.controller';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('StripeWebhooksModule', () => {
  it('owns the Stripe webhook controller and dispatcher boundary', () => {
    const controllers =
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, StripeWebhooksModule) ??
      [];
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, StripeWebhooksModule) ??
      [];
    const exports =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, StripeWebhooksModule) ?? [];

    expect(controllers).toEqual([StripeWebhookController]);
    expect(providers).toContain(StripeWebhookService);
    expect(exports).toContain(StripeWebhookService);
  });

  it('registers the per-concern Stripe webhook handlers', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, StripeWebhooksModule) ??
      [];

    for (const provider of [
      StripeAttributionTrackerService,
      StripeCheckoutWebhookHandler,
      StripeCustomerWebhookHandler,
      StripeInvoiceWebhookHandler,
      StripeSubscriptionWebhookHandler,
      StripeWebhookSupportService,
    ]) {
      expect(providers).toContain(provider);
    }
  });
});
