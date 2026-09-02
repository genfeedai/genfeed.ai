import { createHash } from 'node:crypto';
import { isSelfHostedDeployment } from '@genfeedai/config';
import {
  creditPackTotalCredits,
  INCLUDED_MONTHLY_CREDITS_METADATA_KEY,
  PAYG_CREDIT_PACKS,
  PAYG_CREDITS_PER_USD,
  PAYG_MAX_PURCHASE_USD,
  PAYG_MIN_PURCHASE_USD,
  parseIncludedMonthlyCredits,
  SUBSCRIPTION_PRICE_CONTRACTS,
  type SubscriptionPriceTier,
} from '@genfeedai/pricing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { BILLING_ACCOUNT_METADATA } from '@server/services/integrations/stripe/services/billing-account-metadata.constant';
import {
  classifyStripeFailure,
  isStripeResourceMissingError,
  isStripeSignatureVerificationError,
  StripeBillingConfigurationError,
} from '@server/services/integrations/stripe/services/stripe-error.util';
import {
  collectUpcomingInvoiceLines,
  type UpcomingInvoicePreview,
} from '@server/services/integrations/stripe/services/stripe-upcoming-invoice-lines.util';
import StripeConstructor from 'stripe';

type StripeClient = InstanceType<typeof StripeConstructor>;
export type StripeCheckoutSession = Awaited<
  ReturnType<StripeClient['checkout']['sessions']['create']>
>;
type StripeCheckoutSessionCreateParams = Parameters<
  StripeClient['checkout']['sessions']['create']
>[0];
export type StripeCustomer = Awaited<
  ReturnType<StripeClient['customers']['create']>
>;
type StripeMetadataParam = NonNullable<
  Exclude<StripeCheckoutSessionCreateParams, undefined>['metadata']
>;
type StripeBillingPortalSession = Awaited<
  ReturnType<StripeClient['billingPortal']['sessions']['create']>
>;
type StripeResponse<T> = T;
export type StripePrice = Awaited<
  ReturnType<StripeClient['prices']['retrieve']>
>;
export type StripeSubscription = Awaited<
  ReturnType<StripeClient['subscriptions']['retrieve']>
>;
export type StripeInvoice = Awaited<
  ReturnType<StripeClient['invoices']['retrieve']>
>;
export type StripeCharge = Awaited<
  ReturnType<StripeClient['charges']['retrieve']>
>;
export type StripeDispute = Awaited<
  ReturnType<StripeClient['disputes']['retrieve']>
>;
type StripeWebhookEvent = Awaited<
  ReturnType<StripeClient['webhooks']['constructEventAsync']>
>;

export type { UpcomingInvoicePreview } from '@server/services/integrations/stripe/services/stripe-upcoming-invoice-lines.util';

const STRIPE_PINNED_API_VERSION: StripeConstructor.LatestApiVersion =
  '2026-08-26.dahlia';

function resolveStripeApiVersion(
  configured: string | undefined,
): StripeConstructor.LatestApiVersion {
  if (configured === STRIPE_PINNED_API_VERSION) {
    return configured;
  }
  return STRIPE_PINNED_API_VERSION;
}

@Injectable()
export class StripeService {
  private readonly constructorName: string = String(this.constructor.name);
  // Eager initialization - create client in constructor to avoid race conditions
  // NestJS creates singleton services, so this runs once at startup
  public readonly stripe: StripeClient;
  private readonly validatedSubscriptionPrices = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {
    if (isSelfHostedDeployment()) {
      // Noop — Stripe is not available in self-hosted mode
      this.stripe = null as unknown as StripeClient;
      return;
    }

    // Eager initialization - create Stripe client in constructor
    this.stripe = new StripeConstructor(
      this.configService.get('STRIPE_SECRET_KEY') ?? '',
      {
        apiVersion: resolveStripeApiVersion(
          this.configService.get('STRIPE_API_VERSION'),
        ),
      },
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.isProductionCloud() || isSelfHostedDeployment()) {
      return;
    }

    const proPriceId = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY',
    );
    if (!this.isStripePriceId(proPriceId)) {
      this.loggerService.error(
        `${this.constructorName} production subscription price validation failed`,
        { category: 'configuration', tier: 'pro' },
      );
      throw new StripeBillingConfigurationError();
    }

    await this.validateSubscriptionPriceForTier(proPriceId, 'pro');
  }

  public async validateSubscriptionPriceForTier(
    stripePriceId: string,
    tier: SubscriptionPriceTier,
  ): Promise<void> {
    const cacheKey = `${tier}:${stripePriceId}`;
    if (this.validatedSubscriptionPrices.has(cacheKey)) {
      return;
    }

    let price: StripePrice;
    try {
      price = await this.stripe.prices.retrieve(stripePriceId, {
        expand: ['product'],
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} production subscription price validation failed`,
        { category: classifyStripeFailure(error), tier },
      );
      throw new StripeBillingConfigurationError();
    }

    const contract = SUBSCRIPTION_PRICE_CONTRACTS[tier];
    const rawIncludedMonthlyCredits =
      price.metadata?.[INCLUDED_MONTHLY_CREDITS_METADATA_KEY];
    const includedMonthlyCredits = parseIncludedMonthlyCredits(
      rawIncludedMonthlyCredits,
    );
    const matchesCreditGrant =
      rawIncludedMonthlyCredits === undefined ||
      rawIncludedMonthlyCredits === '' ||
      includedMonthlyCredits === contract.includedMonthlyCredits;
    const matchesContract =
      price.active === true &&
      price.currency === contract.currency &&
      price.recurring?.interval === contract.interval &&
      price.recurring.interval_count === 1 &&
      price.unit_amount === contract.unitAmount &&
      matchesCreditGrant;

    if (!matchesContract) {
      this.loggerService.error(
        `${this.constructorName} production subscription price validation failed`,
        { category: 'configuration', tier },
      );
      throw new StripeBillingConfigurationError();
    }

    this.validatedSubscriptionPrices.add(cacheKey);
    this.loggerService.log(
      `${this.constructorName} subscription price validated`,
      { outcome: 'valid', tier },
    );
  }

  private isStripePriceId(value: unknown): value is string {
    return typeof value === 'string' && /^price_[A-Za-z0-9]+$/.test(value);
  }

  private isProductionCloud(): boolean {
    return (
      this.configService.get('NODE_ENV') === 'production' &&
      ['1', 'true'].includes(
        String(this.configService.get('GENFEED_CLOUD')).toLowerCase(),
      )
    );
  }

  private resolveConfiguredSubscriptionTier(
    stripePriceId: string,
  ): SubscriptionPriceTier | null {
    if (
      stripePriceId ===
      this.configService.get('STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY')
    ) {
      return 'pro';
    }
    if (
      stripePriceId ===
      this.configService.get('STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY')
    ) {
      return 'scale';
    }
    return null;
  }

  /**
   * Verify a Stripe webhook delivery and return the trusted event.
   *
   * Signature failures stay 400. A missing signing secret is an ops fault
   * so Stripe can retry after config is restored.
   */
  public async constructWebhookEvent(
    rawBody: Buffer | string,
    signature: string | undefined,
  ): Promise<StripeWebhookEvent> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const secret = this.configService.get('STRIPE_WEBHOOK_SIGNING_SECRET');

    if (typeof secret !== 'string' || secret.length === 0) {
      throw new Error('Stripe webhook signing secret is not configured');
    }

    try {
      return await this.stripe.webhooks.constructEventAsync(
        rawBody,
        signature ?? '',
        secret,
      );
    } catch (error: unknown) {
      if (isStripeSignatureVerificationError(error)) {
        throw new BadRequestException('Invalid Stripe signature');
      }

      this.loggerService.error(
        `${url} webhook event construction failed`,
        error,
      );
      throw error;
    }
  }

  /**
   * Guard a PAYG credit top-up quantity against the flat top-up bounds.
   *
   * Credits are billed at 1 credit = $0.01, so the dollar bounds
   * (`PAYG_MIN_PURCHASE_USD` / `PAYG_MAX_PURCHASE_USD`) map to credit bounds by
   * the canonical credits-per-dollar rate. Presets and custom amounts both flow through here, so the
   * server is the single source of truth for min/max — the UI bound is a
   * convenience, not the enforcement point.
   *
   * @throws BadRequestException when `quantity` (in credits) is outside range.
   */
  private assertPaygQuantityWithinBounds(quantity: number): void {
    const minCredits = PAYG_MIN_PURCHASE_USD * PAYG_CREDITS_PER_USD;
    const maxCredits = PAYG_MAX_PURCHASE_USD * PAYG_CREDITS_PER_USD;

    if (
      !Number.isFinite(quantity) ||
      quantity < minCredits ||
      quantity > maxCredits
    ) {
      throw new BadRequestException(
        `Credit top-up must be between $${PAYG_MIN_PURCHASE_USD.toLocaleString()} and $${PAYG_MAX_PURCHASE_USD.toLocaleString()} ` +
          `(${minCredits.toLocaleString()}–${maxCredits.toLocaleString()} credits).`,
      );
    }
  }

  /** Owner-and-input-scoped idempotency key for consumer customer creation. */
  private buildCustomerIdempotencyKey(
    ownerKey: string,
    params: Record<string, string | undefined>,
  ): string {
    const paramsHash = createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .slice(0, 16);

    return `${ownerKey}-${paramsHash}`;
  }

  public async createOrganizationCustomer(
    organizationName: string,
    billingEmail: string,
    organizationId: string,
    userId: string,
    replacesStripeCustomerId?: string | null,
  ): Promise<StripeCustomer> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const customer = await this.stripe.customers.create(
        {
          email: billingEmail,
          metadata: {
            organizationId,
            type: 'organization',
            userId,
          },
          name: organizationName,
        },
        {
          idempotencyKey: this.buildCustomerIdempotencyKey(
            `org-customer-${organizationId}`,
            {
              generation: replacesStripeCustomerId ?? 'initial',
            },
          ),
        },
      );

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

  public async createBillingAccountCustomer(
    accountName: string,
    billingEmail: string,
    billingAccountId: string,
    organizationId: string,
    userId: string,
    replacesStripeCustomerId?: string | null,
  ): Promise<StripeCustomer> {
    return this.stripe.customers.create(
      {
        email: billingEmail,
        metadata: {
          [BILLING_ACCOUNT_METADATA.billingAccountId]: billingAccountId,
          [BILLING_ACCOUNT_METADATA.organizationId]: organizationId,
          [BILLING_ACCOUNT_METADATA.type]: 'billing_account',
          userId,
        },
        name: accountName,
      },
      {
        idempotencyKey: this.buildCustomerIdempotencyKey(
          `billing-account-customer-${billingAccountId}`,
          { generation: replacesStripeCustomerId ?? 'initial' },
        ),
      },
    );
  }

  /**
   * Create a Stripe customer for an individual user (consumer apps like getshareable.app)
   * User-level customers are separate from organization customers
   */
  public async createUserCustomer(
    userId: string,
    email: string,
    name?: string,
  ): Promise<StripeCustomer> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const customer = await this.stripe.customers.create(
        {
          email,
          metadata: {
            type: 'user',
            userId,
          },
          name: name || email,
        },
        {
          idempotencyKey: this.buildCustomerIdempotencyKey(
            `user-customer-${userId}`,
            { email, name },
          ),
        },
      );

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
  }): Promise<StripeCheckoutSession> {
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

      const sessionConfig: StripeCheckoutSessionCreateParams = {
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

  public async createManagedPaymentSession(params: {
    email: string;
    firstName?: string;
    lastName?: string;
    stripePriceId: string;
    quantity?: number;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<StripeCheckoutSession> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const {
        email,
        firstName,
        lastName,
        stripePriceId,
        quantity = 1000,
        successUrl,
        cancelUrl,
      } = params;

      const isPayg =
        stripePriceId === this.configService.get('STRIPE_PRICE_PAYG');

      const metadata: StripeMetadataParam = {
        email,
        type: 'managed_inference',
      };

      if (firstName?.trim()) {
        metadata.firstName = firstName.trim();
      }

      if (lastName?.trim()) {
        metadata.lastName = lastName.trim();
      }

      if (isPayg) {
        this.assertPaygQuantityWithinBounds(quantity);
        const pack = PAYG_CREDIT_PACKS.find((p) => p.credits === quantity);
        const totalCredits = pack ? creditPackTotalCredits(pack) : quantity;
        metadata.credits = String(totalCredits);
        metadata.plan_type = 'payg';
      }

      const session = await this.stripe.checkout.sessions.create({
        allow_promotion_codes: true,
        automatic_tax: {
          enabled: true,
        },
        cancel_url:
          cancelUrl || `${this.configService.get('GENFEEDAI_APP_URL')}/credits`,
        customer_creation: 'always',
        customer_email: email,
        line_items: [
          {
            price: stripePriceId,
            quantity,
          },
        ],
        metadata,
        mode: 'payment',
        payment_method_types: ['card'],
        success_url:
          successUrl ||
          `${this.configService.get('GENFEEDAI_APP_URL')}/credits/success?session_id={CHECKOUT_SESSION_ID}`,
        tax_id_collection: {
          enabled: true,
        },
      });

      this.loggerService.log(`${url} success`, {
        email,
        sessionId: session.id,
        stripePriceId,
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
  ): Promise<StripeResponse<StripeBillingPortalSession>> {
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
  ): Promise<StripeCheckoutSession> {
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
  ): Promise<StripeCustomer | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        return null;
      }

      return customer as StripeCustomer;
    } catch (error: unknown) {
      // Stale IDs from a previous Stripe account / deleted customers must not
      // hard-fail checkout — callers re-create and rebind.
      if (isStripeResourceMissingError(error)) {
        this.loggerService.warn(`${url} customer missing on Stripe account`, {
          category: 'customer_missing',
        });
        return null;
      }

      this.loggerService.error(`${url} failed`, {
        category: classifyStripeFailure(error),
      });
      throw error;
    }
  }

  public async findOrganizationCustomers(
    organizationId: string,
  ): Promise<StripeCustomer[]> {
    const escapedOrganizationId = organizationId.replaceAll("'", "\\'");
    try {
      const result = await this.stripe.customers.search({
        limit: 10,
        query: `metadata['organizationId']:'${escapedOrganizationId}' AND metadata['type']:'organization'`,
      });
      return result.data.filter(
        (customer) => !customer.deleted,
      ) as StripeCustomer[];
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} organization customer search failed`,
        { category: classifyStripeFailure(error) },
      );
      throw error;
    }
  }

  public async findBillingAccountCustomers(
    billingAccountId: string,
  ): Promise<StripeCustomer[]> {
    const escapedBillingAccountId = billingAccountId.replaceAll("'", "\\'");
    try {
      const result = await this.stripe.customers.search({
        limit: 10,
        query: `metadata['${BILLING_ACCOUNT_METADATA.billingAccountId}']:'${escapedBillingAccountId}' AND metadata['${BILLING_ACCOUNT_METADATA.type}']:'billing_account'`,
      });
      return result.data.filter(
        (customer) => !customer.deleted,
      ) as StripeCustomer[];
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} billing account customer search failed`,
        { category: classifyStripeFailure(error) },
      );
      throw error;
    }
  }

  /**
   * `returnUrl` is the absolute URL Stripe sends the customer back to. The
   * caller composes it from the trusted request origin — this service never
   * appends a path of its own, which is how the portal used to return to a
   * nonexistent `/billing` route.
   */
  public async getBillingPortalUrl(
    customerId: string,
    returnUrl: string,
  ): Promise<StripeResponse<StripeBillingPortalSession>> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      return await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        category: classifyStripeFailure(error),
      });
      throw error;
    }
  }

  public async getPrice(stripePriceId: string): Promise<StripePrice> {
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
      [this.configService.get('STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY') || '']:
        'pro',
      [this.configService.get('STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY') || '']:
        'pro',
      [this.configService.get('STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY') || '']:
        'scale',
      [this.configService.get('STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY') ||
        '']: 'enterprise',
    };

    const tier = priceToTier[stripePriceId] || 'custom';

    const isYearly =
      stripePriceId ===
      this.configService.get('STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY');

    return {
      tier,
      type: isYearly ? 'yearly' : 'monthly',
    };
  }

  /**
   * Always open Checkout promo entry. Stripe rejects sessions that set both
   * `discounts` and `allow_promotion_codes`, so we never force-apply a code
   * here — public defaults (EARLYGENFEED / EARLYGEN) and customer-restricted
   * team codes (GENFEED100) are entered at Checkout.
   */
  private applyPromotionCode(
    sessionConfig: NonNullable<StripeCheckoutSessionCreateParams>,
    _stripePriceId: string,
  ): void {
    sessionConfig.allow_promotion_codes = true;
    delete sessionConfig.discounts;
  }

  public async createPaymentSession(
    customerId: string,
    stripePriceId: string,
    origin: string,
    quantity: number = 1000,
    redirectUrls?: { success: string; cancel: string },
    billingContext?: { organizationId: string },
  ): Promise<StripeCheckoutSession> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Determine if this is a subscription or one-time payment.
      // Tier pricing: Pro ($49/mo, "Creator" card + yearly), Scale ($499/mo,
      // "Cloud Teams" card), Enterprise (custom).
      const subscriptionPriceIds = [
        this.configService.get('STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY'),
        this.configService.get('STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY'),
        this.configService.get('STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY'),
        this.configService.get('STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY'),
      ].filter(Boolean);

      const isSubscription = subscriptionPriceIds.includes(stripePriceId);

      const isPayg =
        stripePriceId === this.configService.get('STRIPE_PRICE_PAYG');

      let sessionConfig: StripeCheckoutSessionCreateParams;

      if (isSubscription) {
        const configuredTier =
          this.resolveConfiguredSubscriptionTier(stripePriceId);
        if (configuredTier && this.isProductionCloud()) {
          await this.validateSubscriptionPriceForTier(
            stripePriceId,
            configuredTier,
          );
        }

        // Determine tier from price ID for metadata
        const tierMetadata = this.getSubscriptionTierMetadata(stripePriceId);

        // Monthly subscription
        sessionConfig = {
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

        this.applyPromotionCode(sessionConfig, stripePriceId);
      } else if (isPayg) {
        // Pay as you go credits — flat top-up, min/max enforced server-side
        this.assertPaygQuantityWithinBounds(quantity);
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

      if (billingContext) {
        const billingMetadata = {
          [BILLING_ACCOUNT_METADATA.organizationId]:
            billingContext.organizationId,
          [BILLING_ACCOUNT_METADATA.type]: 'organization',
        };
        sessionConfig.metadata = {
          ...sessionConfig.metadata,
          ...billingMetadata,
        };
        if (sessionConfig.subscription_data) {
          sessionConfig.subscription_data.metadata = {
            ...sessionConfig.subscription_data.metadata,
            ...billingMetadata,
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
  ): Promise<StripeSubscription> {
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
  ): Promise<StripeSubscription> {
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
  ): Promise<StripeSubscription> {
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
    currentPriceId: string,
    newPriceId: string,
    quantity?: number,
  ): Promise<UpcomingInvoicePreview> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      if (!this.isStripePriceId(currentPriceId)) {
        throw new BadRequestException('Invalid current Stripe price ID');
      }
      if (!this.isStripePriceId(newPriceId)) {
        throw new BadRequestException('Invalid Stripe price ID');
      }
      if (
        quantity !== undefined &&
        (!Number.isInteger(quantity) || quantity < 1)
      ) {
        throw new BadRequestException(
          'Subscription quantity must be a positive integer',
        );
      }

      const subscription =
        await this.stripe.subscriptions.retrieve(subscriptionId);
      const subscriptionCustomerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id;
      if (subscriptionCustomerId !== customerId) {
        throw new BadRequestException(
          'Stripe subscription does not belong to the requested customer',
        );
      }

      if (subscription.items.data.length === 0) {
        throw new BadRequestException('No subscription items found');
      }
      if (subscription.items.data.every((item) => !item.price?.id)) {
        throw new BadRequestException('No price found for subscription item');
      }
      const subscriptionItem = subscription.items.data.find(
        (item) => item.price?.id === currentPriceId,
      );
      if (!subscriptionItem?.id) {
        throw new BadRequestException(
          'No subscription item found for current Stripe price',
        );
      }
      const targetPrice = await this.stripe.prices.retrieve(newPriceId);
      const targetQuantity =
        targetPrice.recurring?.usage_type === 'metered'
          ? undefined
          : (quantity ?? subscriptionItem.quantity ?? undefined);

      const upcomingInvoice = await this.stripe.invoices.createPreview({
        customer: customerId,
        subscription: subscriptionId,
        subscription_details: {
          items: [
            {
              id: subscriptionItem.id,
              price: newPriceId,
              ...(targetQuantity === undefined
                ? {}
                : { quantity: targetQuantity }),
            },
          ],
          proration_behavior: 'create_prorations',
        },
      });

      const fullUpcomingInvoice = await collectUpcomingInvoiceLines({
        context: { customerId, subscriptionId, url },
        logger: this.loggerService,
        stripe: this.stripe,
        upcomingInvoice,
      });

      this.loggerService.log(`${url} success`, {
        amountDue: fullUpcomingInvoice.amount_due,
        customerId,
        currency: fullUpcomingInvoice.currency,
        currentPriceId,
        lineCount: fullUpcomingInvoice.lines.data.length,
        newPriceId,
        quantity: targetQuantity,
        subscriptionId,
        subscriptionItemId: subscriptionItem.id,
        targetUsageType: targetPrice.recurring?.usage_type,
      });

      return fullUpcomingInvoice;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
