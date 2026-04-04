import { ConfigService } from '@api/config/config.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeConnectService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Create a Stripe Connect Express account for a seller
   */
  @HandleErrors('create connect account', 'stripe-connect')
  async createConnectAccount(params: {
    email: string;
    sellerId: string;
    displayName: string;
  }): Promise<Stripe.Account> {
    const { email, sellerId, displayName } = params;

    this.loggerService.log(`${this.constructorName} createConnectAccount`, {
      email,
      sellerId,
    });

    const account = await this.stripeService.stripe.accounts.create({
      business_profile: {
        name: displayName,
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      email,
      metadata: {
        sellerId,
      },
      type: 'express',
    });

    return account;
  }

  /**
   * Create an onboarding link for Stripe Connect
   */
  @HandleErrors('create onboarding link', 'stripe-connect')
  async createOnboardingLink(params: {
    accountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<string> {
    const { accountId, returnUrl, refreshUrl } = params;

    const accountLink = await this.stripeService.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return accountLink.url;
  }

  /**
   * Get the Express dashboard login link for a seller
   */
  @HandleErrors('create dashboard link', 'stripe-connect')
  async createDashboardLink(accountId: string): Promise<string> {
    const loginLink =
      await this.stripeService.stripe.accounts.createLoginLink(accountId);
    return loginLink.url;
  }

  /**
   * Retrieve Connect account details
   */
  @HandleErrors('get account details', 'stripe-connect')
  async getAccountDetails(accountId: string): Promise<Stripe.Account> {
    return await this.stripeService.stripe.accounts.retrieve(accountId);
  }

  /**
   * Check if a Connect account has completed onboarding
   */
  @HandleErrors('check onboarding status', 'stripe-connect')
  async checkOnboardingComplete(accountId: string): Promise<{
    complete: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  }> {
    const account = await this.getAccountDetails(accountId);

    return {
      chargesEnabled: account.charges_enabled || false,
      complete: account.details_submitted || false,
      payoutsEnabled: account.payouts_enabled || false,
    };
  }

  /**
   * Get balance for a Connect account
   */
  @HandleErrors('get account balance', 'stripe-connect')
  async getAccountBalance(
    accountId: string,
  ): Promise<{ available: number; pending: number }> {
    const balance = await this.stripeService.stripe.balance.retrieve({
      stripeAccount: accountId,
    });

    const available = balance.available.reduce((sum, b) => sum + b.amount, 0);
    const pending = balance.pending.reduce((sum, b) => sum + b.amount, 0);

    return { available, pending };
  }

  /**
   * Create a payout to a Connect account's bank
   */
  @HandleErrors('create payout', 'stripe-connect')
  async createPayout(params: {
    accountId: string;
    amount: number;
    currency?: string;
  }): Promise<Stripe.Payout> {
    const { accountId, amount, currency = 'usd' } = params;

    if (amount <= 0) {
      throw new BadRequestException('Payout amount must be positive');
    }

    return await this.stripeService.stripe.payouts.create(
      {
        amount,
        currency,
      },
      {
        stripeAccount: accountId,
      },
    );
  }

  /**
   * List payouts for a Connect account
   */
  @HandleErrors('list payouts', 'stripe-connect')
  async listPayouts(
    accountId: string,
    limit: number = 10,
  ): Promise<Stripe.ApiList<Stripe.Payout>> {
    return await this.stripeService.stripe.payouts.list(
      { limit },
      { stripeAccount: accountId },
    );
  }

  /**
   * Create a PaymentIntent with Connect transfer
   */
  @HandleErrors('create payment intent', 'stripe-connect')
  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    sellerAccountId: string;
    applicationFeeAmount: number;
    metadata: Record<string, string>;
  }): Promise<Stripe.PaymentIntent> {
    const {
      amount,
      currency,
      sellerAccountId,
      applicationFeeAmount,
      metadata,
    } = params;

    return await this.stripeService.stripe.paymentIntents.create({
      amount,
      application_fee_amount: applicationFeeAmount,
      currency,
      metadata,
      transfer_data: {
        destination: sellerAccountId,
      },
    });
  }

  /**
   * Process a refund for a marketplace purchase
   */
  @HandleErrors('process refund', 'stripe-connect')
  async processRefund(params: {
    paymentIntentId: string;
    amount?: number;
    reason?: Stripe.RefundCreateParams.Reason;
  }): Promise<Stripe.Refund> {
    const { paymentIntentId, amount, reason } = params;

    return await this.stripeService.stripe.refunds.create({
      amount,
      payment_intent: paymentIntentId,
      reason: reason || 'requested_by_customer',
      refund_application_fee: true,
      reverse_transfer: true,
    });
  }
}
