import { ConfigService } from '@api/config/config.service';
import { creditPackTotalCredits, PAYG_CREDIT_PACKS } from '@genfeedai/helpers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

type UpcomingInvoicePreview = {
  amount_due: number;
  currency: string;
  lines: {
    data: Stripe.InvoiceLineItem[];
  };
};

@Injectable()
export class StripeService {
  private readonly constructorName: string = String(this.constructor.name);
  // Eager initialization - create client in constructor to avoid race conditions
  // NestJS creates singleton services, so this runs once at startup
  public readonly stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {
    // Eager initialization - create Stripe client in constructor
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY')!, {
      apiVersion: this.configService.get(
        'STRIPE_API_VERSION',
      ) as '2026-02-25.clover',
    });
  }

  public async createOrganizationCustomer(
    organizationName: string,
    billingEmail: string,
    organizationId: string,
    userId: string,
  ): Promise<Stripe.Customer> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const customer = await this.stripe.customers.create({
        email: billingEmail,
        metadata: {
          organizationId,
          type: 'organization',
          userId,
        },
        name: organizationName,
      });

      this.loggerService.log(`${url} success`, {
        billingEmail,
        organizationId,
        organizationName,
      });
      return customer;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Create a Stripe customer for an individual user (consumer apps like getshareable.app)
   * User-level customers are separate from organization customers
   */
  public async createUserCustomer(
    userId: string,
    email: string,
    name?: string,
  ): Promise<Stripe.Customer> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const customer = await this.stripe.customers.create({
        email,
        metadata: {
          type: 'user',
          userId,
        },
        name: name || email,
      });

      this.loggerService.log(`${url} success`, {
        customerId: customer.id,
        email,
        userId,
      });
      return customer;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Create a checkout session for user-level credit purchases (getshareable.app)
   * Supports both one-time credit packs and subscriptions
   */
  public async createUserPaymentSession(params: {
    userId: string;
    stripeCustomerId: string;
    stripePriceId: string;
    successUrl: string;
    cancelUrl: string;
    quantity?: number;
    mode?: 'payment' | 'subscription';
  }): Promise<Stripe.Checkout.Session> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const {
        userId,
        stripeCustomerId,
        stripePriceId,
        successUrl,
        cancelUrl,
        quantity = 1,
        mode = 'payment',
      } = params;

      const sessionConfig: Stripe.Checkout.SessionCreateParams = {
        allow_promotion_codes: true,
        automatic_tax: {
          enabled: true,
        },
        cancel_url: cancelUrl,
        customer: stripeCustomerId,
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
        line_items: [
          {
            price: stripePriceId,
            quantity,
          },
        ],
        metadata: {
          credits: String(quantity),
          type: 'user',
          userId,
        },
        mode,
        payment_method_types: ['card'],
        saved_payment_method_options: {
          payment_method_remove: 'enabled',
          payment_method_save: 'enabled',
        },
        success_url: successUrl,
        tax_id_collection: {
          enabled: true,
        },
      };

      if (mode === 'subscription') {
        sessionConfig.subscription_data = {
          metadata: {
            type: 'user',
            userId,
          },
        };
      }

      const session = await this.stripe.checkout.sessions.create(sessionConfig);

      this.loggerService.log(`${url} success`, {
        mode,
        sessionId: session.id,
        stripeCustomerId,
        stripePriceId,
        userId,
      });

      return session;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Get billing portal URL for user-level customers
   */
  public async getUserBillingPortalUrl(
    stripeCustomerId: string,
    returnUrl: string,
  ): Promise<Stripe.Response<Stripe.BillingPortal.Session>> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      return await this.stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async createSetupCheckoutSession(
    customerId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<Stripe.Checkout.Session> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const session = await this.stripe.checkout.sessions.create({
        cancel_url: cancelUrl,
        customer: customerId,
        mode: 'setup',
        payment_method_types: ['card'],
        success_url: successUrl,
      });

      this.loggerService.log(`${url} success`, {
        customerId,
        sessionId: session.id,
      });
      return session;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async retrieveCustomer(
    customerId: string,
  ): Promise<Stripe.Customer | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        return null;
      }

      return customer as Stripe.Customer;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getBillingPortalUrl(
    customerId: string,
    origin: string,
  ): Promise<Stripe.Response<Stripe.BillingPortal.Session>> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      return await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/billing`,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getPrice(stripePriceId: string): Promise<Stripe.Price> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const price = await this.stripe.prices.retrieve(stripePriceId, {
        expand: ['product'],
      });

      this.loggerService.log(`${url} success`, { stripePriceId });
      return price;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Get subscription tier metadata from price ID
   * Used to track which tier a subscription belongs to
   */
  private getSubscriptionTierMetadata(stripePriceId: string): {
    tier: string;
    type: string;
  } {
    const priceToTier: Record<string, string> = {
      [this.configService.get('STRIPE_PRICE_SUBSCRIPTION_CREATOR_MONTHLY') ||
        '']: 'creator',
      [this.configService.get('STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY') || '']:
        'pro',
      [this.configService.get('STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY') || '']:
        'scale',
      [this.configService.get('STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY') ||
        '']: 'enterprise',
    };

    const tier = priceToTier[stripePriceId] || 'custom';

    return {
      tier,
      type: 'monthly',
    };
  }

  public async createPaymentSession(
    customerId: string,
    stripePriceId: string,
    origin: string,
    quantity: number = 1000,
    redirectUrls?: { success: string; cancel: string },
  ): Promise<Stripe.Checkout.Session> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Determine if this is a subscription or one-time payment
      // New tier-based pricing: Pro ($499), Scale ($1,499), Enterprise ($4,999), Creator ($50 - unlisted)
      const subscriptionPriceIds = [
        this.configService.get('STRIPE_PRICE_SUBSCRIPTION_CREATOR_MONTHLY'), // $50/mo - unlisted
        this.configService.get('STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY'), // $499/mo
        this.configService.get('STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY'), // $1,499/mo
        this.configService.get('STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY'), // $4,999/mo
      ].filter(Boolean);

      const isSubscription = subscriptionPriceIds.includes(stripePriceId);

      const isPayg =
        stripePriceId === this.configService.get('STRIPE_PRICE_PAYG');

      let sessionConfig: Stripe.Checkout.SessionCreateParams;

      if (isSubscription) {
        // Determine tier from price ID for metadata
        const tierMetadata = this.getSubscriptionTierMetadata(stripePriceId);

        // Monthly subscription
        sessionConfig = {
          allow_promotion_codes: true,
          automatic_tax: {
            enabled: true,
          },
          customer: customerId,
          customer_update: {
            address: 'auto',
            name: 'auto',
          },
          line_items: [
            {
              price: stripePriceId,
              quantity: 1,
            },
          ],
          mode: 'subscription',
          payment_method_types: ['card'],
          saved_payment_method_options: {
            payment_method_remove: 'enabled',
            payment_method_save: 'enabled',
          },
          subscription_data: {
            metadata: tierMetadata,
          },
          tax_id_collection: {
            enabled: true,
          },
        };
      } else if (isPayg) {
        // Pay as you go credits — bonus delivered via metadata, not coupons
        const pack = PAYG_CREDIT_PACKS.find((p) => p.credits === quantity);
        const totalCredits = pack ? creditPackTotalCredits(pack) : quantity;

        sessionConfig = {
          allow_promotion_codes: true,
          automatic_tax: {
            enabled: true,
          },
          customer: customerId,
          customer_update: {
            address: 'auto',
            name: 'auto',
          },
          line_items: [
            {
              price: stripePriceId,
              quantity,
            },
          ],
          metadata: {
            credits: String(totalCredits),
            plan_type: 'payg',
          },
          mode: 'payment',
          payment_method_types: ['card'],
          saved_payment_method_options: {
            payment_method_remove: 'enabled',
            payment_method_save: 'enabled',
          },
          tax_id_collection: {
            enabled: true,
          },
        };
      } else {
        // Use the provided price ID directly (for custom prices)
        const priceDetails = await this.getPrice(stripePriceId);
        const isRecurring = !!priceDetails.recurring;

        sessionConfig = {
          allow_promotion_codes: true,
          automatic_tax: {
            enabled: true,
          },
          customer: customerId,
          customer_update: {
            address: 'auto',
            name: 'auto',
          },
          line_items: [
            {
              price: stripePriceId,
              quantity,
            },
          ],
          mode: isRecurring ? 'subscription' : 'payment',
          payment_method_types: ['card'],
          saved_payment_method_options: {
            payment_method_remove: 'enabled',
            payment_method_save: 'enabled',
          },
          tax_id_collection: {
            enabled: true,
          },
        };

        if (isRecurring) {
          sessionConfig.subscription_data = {
            metadata: {
              plan_type: 'custom',
            },
          };
        }
      }

      // Add success and cancel URLs (custom overrides take priority)
      if (redirectUrls?.success) {
        sessionConfig.success_url = redirectUrls.success;
      } else {
        sessionConfig.success_url =
          origin === this.configService.get('GENFEEDAI_APP_URL')
            ? `${origin}/welcome/subscribe/success`
            : `${origin}/billing`;
      }

      if (redirectUrls?.cancel) {
        sessionConfig.cancel_url = redirectUrls.cancel;
      } else {
        sessionConfig.cancel_url =
          origin === this.configService.get('GENFEEDAI_APP_URL')
            ? `${origin}/welcome/subscribe/cancel`
            : `${origin}/billing`;
      }

      const session = await this.stripe.checkout.sessions.create(sessionConfig);

      this.loggerService.log(`${url} success`, {
        customerId,
        mode: sessionConfig.mode,
        sessionId: session.id,
        stripePriceId,
      });
      return session;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async cancelSubscription(
    stripeSubscriptionId: string,
    cancelAtPeriodEnd: boolean = true,
  ): Promise<Stripe.Subscription> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const subscription = await this.stripe.subscriptions.update(
        stripeSubscriptionId,
        {
          cancel_at_period_end: cancelAtPeriodEnd,
        },
      );

      this.loggerService.log(`${url} success`, {
        cancelAtPeriodEnd,
        stripeSubscriptionId,
      });
      return subscription;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async changeSubscriptionPlan(
    stripeSubscriptionId: string,
    newPriceId: string,
    prorationBehavior: 'create_prorations' | 'none' = 'create_prorations',
  ): Promise<Stripe.Subscription> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // First, get the current subscription to find the subscription item
      const subscription = await this.stripe.subscriptions.retrieve(
        stripeSubscriptionId,
        {
          expand: ['items.data.price'],
        },
      );

      if (!subscription.items.data || subscription.items.data.length === 0) {
        throw new Error('No subscription items found');
      }

      const subscriptionItem = subscription.items.data[0];

      // Update the subscription with the new price
      const updatedSubscription = await this.stripe.subscriptions.update(
        stripeSubscriptionId,
        {
          items: [
            {
              id: subscriptionItem.id,
              price: newPriceId,
            },
          ],
          proration_behavior: prorationBehavior,
        },
      );

      this.loggerService.log(`${url} success`, {
        newPriceId,
        oldPriceId: subscriptionItem.price.id,
        prorationBehavior,
        stripeSubscriptionId,
      });

      return updatedSubscription;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getSubscription(
    stripeSubscriptionId: string,
  ): Promise<Stripe.Subscription> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const subscription = await this.stripe.subscriptions.retrieve(
        stripeSubscriptionId,
        {
          expand: ['items.data.price', 'customer'],
        },
      );

      this.loggerService.log(`${url} success`, {
        status: subscription.status,
        stripeSubscriptionId,
      });

      return subscription;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getUpcomingInvoice(
    customerId: string,
    subscriptionId: string,
    newPriceId: string,
  ): Promise<UpcomingInvoicePreview> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Get the subscription to find the subscription item
      const subscription =
        await this.stripe.subscriptions.retrieve(subscriptionId);

      if (!subscription.items.data || subscription.items.data.length === 0) {
        throw new Error('No subscription items found');
      }

      // Preview the upcoming invoice with the new price
      const upcomingInvoice = await this.stripe.invoices.list({
        customer: customerId,
        limit: 1,
        subscription: subscriptionId,
      });

      this.loggerService.log(`${url} success`, {
        customerId,
        invoiceCount: upcomingInvoice.data.length,
        newPriceId,
        subscriptionId,
      });

      // Return a mock invoice for preview purposes
      return {
        amount_due: 0, // This will be calculated on the frontend based on price difference
        currency: 'usd',
        lines: { data: [] },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
