import { StripeCheckoutWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-checkout-webhook.handler';
import { StripeCustomerWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-customer-webhook.handler';
import { StripeInvoiceWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler';
import { StripeSubscriptionWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler';
import type { StripeWebhookEvent } from '@api/endpoints/webhooks/stripe/stripe-webhook.util';
import type {
  StripeCheckoutSession,
  StripeCustomer,
  StripeInvoice,
  StripeSubscription,
} from '@api/services/integrations/stripe/services/stripe.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Routes Stripe webhook events to per-concern handlers.
 *
 * All billing logic lives in the handlers under ./handlers; this service
 * only dispatches on the event type.
 */
@Injectable()
export class StripeWebhookService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,

    private readonly subscriptionHandler: StripeSubscriptionWebhookHandler,
    private readonly checkoutHandler: StripeCheckoutWebhookHandler,
    private readonly invoiceHandler: StripeInvoiceWebhookHandler,
    private readonly customerHandler: StripeCustomerWebhookHandler,
  ) {}

  async handleWebhookEvent(event: StripeWebhookEvent, url: string) {
    switch (event.type) {
      case 'customer.subscription.created': {
        await this.subscriptionHandler.handleSubscriptionCreated(
          event.data.object as StripeSubscription,
          url,
        );
        break;
      }

      case 'customer.subscription.updated': {
        await this.subscriptionHandler.handleSubscriptionUpdated(
          event.data.object as StripeSubscription,
          url,
        );
        break;
      }

      case 'customer.subscription.deleted': {
        await this.subscriptionHandler.handleSubscriptionDeleted(
          event.data.object as StripeSubscription,
          url,
        );
        break;
      }

      case 'checkout.session.completed': {
        await this.checkoutHandler.handleCheckoutCompleted(
          event.data.object as StripeCheckoutSession,
          url,
        );
        break;
      }

      case 'invoice.paid': {
        await this.invoiceHandler.handleInvoicePaid(
          event.data.object as StripeInvoice,
          url,
        );
        break;
      }

      case 'invoice.payment_failed': {
        await this.invoiceHandler.handleInvoicePaymentFailed(
          event.data.object as StripeInvoice,
          url,
        );
        break;
      }

      // charge.dispute.created, charge.dispute.closed, charge.refunded
      // for marketplace purchases are handled by the marketplace service.

      case 'customer.created': {
        this.customerHandler.handleCustomerCreated(
          event.data.object as StripeCustomer,
          url,
        );
        break;
      }

      case 'customer.updated': {
        await this.customerHandler.handleCustomerUpdated(
          event.data.object as StripeCustomer,
          url,
        );
        break;
      }

      default:
        this.loggerService.log(
          `${this.constructorName} ${url} unhandled event type: ${event.type}`,
        );
    }
  }
}
