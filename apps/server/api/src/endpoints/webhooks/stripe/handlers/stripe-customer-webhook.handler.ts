import { getEmailLogMetadata } from '@api/endpoints/webhooks/stripe/stripe-webhook.util';
import type { StripeCustomer } from '@api/services/integrations/stripe/services/stripe.service';
import {
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';

/** Handles customer.created / customer.updated Stripe webhook events. */
@Injectable()
export class StripeCustomerWebhookHandler {
  constructor(
    private readonly loggerService: LoggerService,

    @Inject(SUBSCRIPTIONS_SERVICE)
    private readonly subscriptionsService: ISubscriptionsService,
  ) {}

  /**
   * Customer creation is handled by our CustomersService; this webhook is
   * mainly for logging/auditing.
   */
  handleCustomerCreated(customer: StripeCustomer, url: string): void {
    this.loggerService.log(`${url} customer created in Stripe`, {
      customerId: customer.id,
      ...getEmailLogMetadata(customer.email),
    });
  }

  async handleCustomerUpdated(
    customer: StripeCustomer,
    url: string,
  ): Promise<void> {
    try {
      // Sync subscription data from Stripe to our database
      const existingSubscription =
        await this.subscriptionsService.findByStripeCustomerId(customer.id);

      if (existingSubscription) {
        await this.subscriptionsService.syncWithStripe(existingSubscription);
        this.loggerService.log(`${url} customer synced from Stripe`, {
          customerId: customer.id,
          organizationId: existingSubscription.organization,
        });
      }
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle customer updated`,
        error,
      );
    }
  }
}
