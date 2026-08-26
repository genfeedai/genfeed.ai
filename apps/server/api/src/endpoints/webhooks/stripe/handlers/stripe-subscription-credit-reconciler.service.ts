import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import {
  ActivityKey,
  ActivitySource,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@genfeedai/enums';
import type { ISubscriptionOssReadModel } from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const SUBSCRIPTION_INITIAL_CREDIT_REFERENCE_TYPE =
  'stripe-subscription:initial-grant';
const SUBSCRIPTION_INVOICE_CREDIT_REFERENCE_TYPE =
  'stripe-invoice:subscription-grant';
const ACTIVE_SUBSCRIPTION_STATUSES = new Set<string>([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
]);

type SubscriptionCreditTrigger =
  | 'customer.subscription.created'
  | 'invoice.paid';

type SubscriptionCreditReconciliationInput = {
  billingReason: 'subscription_create' | 'subscription_cycle';
  invoiceId?: string;
  periodEnd?: Date;
  periodStart?: Date;
  stripeSubscriptionId: string;
  subscription: ISubscriptionOssReadModel;
  subscriptionStatus?: string | null;
  trigger: SubscriptionCreditTrigger;
  url: string;
};

type CreditReference = {
  referenceId: string;
  referenceType: string;
};

type CreditTransactionOptions = CreditReference & {
  metadata: Record<string, unknown>;
};

type SubscriptionCreditReconciliationContext =
  SubscriptionCreditReconciliationInput & {
    creditReference: CreditReference;
    creditsToAdd: number;
    organizationId: string;
  };

type SubscriptionCreditGrantLookup = {
  legacyInvoiceReference?: CreditReference;
  legacyPeriod?: {
    end: Date;
    source: string;
    start: Date;
  };
  reference: CreditReference;
};

type DuplicateLogDetails = {
  billingReason: string;
  invoiceId?: string;
  organizationId: string;
  outcome: 'existing_grant' | 'unique_constraint_race';
  referenceId: string;
  referenceType: string;
  stripeSubscriptionId: string;
  trigger: SubscriptionCreditTrigger;
  url: string;
};

/**
 * Converges subscription.created and invoice.paid onto one durable initial
 * credit grant while preserving invoice-keyed grants for later billing cycles.
 */
@Injectable()
export class StripeSubscriptionCreditReconcilerService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly creditGrantService: SubscriptionCreditGrantService,
    private readonly supportService: StripeWebhookSupportService,
  ) {}

  async reconcile(
    input: SubscriptionCreditReconciliationInput,
  ): Promise<boolean> {
    const context = await this.prepareContext(input);
    return context ? await this.reconcileContext(context) : false;
  }

  private async prepareContext(
    input: SubscriptionCreditReconciliationInput,
  ): Promise<SubscriptionCreditReconciliationContext | null> {
    const organizationId = input.subscription.organizationId ?? '';

    if (organizationId) {
      return await this.requireEligibleStatus({ ...input, organizationId });
    }

    this.loggerService.warn(
      `${input.url} subscription credit reconciliation skipped`,
      {
        billingReason: input.billingReason,
        outcome: 'missing_organization',
        stripeSubscriptionId: input.stripeSubscriptionId,
        trigger: input.trigger,
      },
    );
    return null;
  }

  private async requireEligibleStatus(
    context: SubscriptionCreditReconciliationInput & {
      organizationId: string;
    },
  ): Promise<SubscriptionCreditReconciliationContext | null> {
    if (this.isEligibleStatus(context)) {
      return await this.requireCreditAllocation(context);
    }

    this.loggerService.log(
      `${context.url} subscription credit reconciliation skipped`,
      {
        billingReason: context.billingReason,
        organizationId: context.organizationId,
        outcome: 'ineligible_status',
        status: context.subscriptionStatus,
        stripeSubscriptionId: context.stripeSubscriptionId,
        trigger: context.trigger,
      },
    );
    return null;
  }

  private isEligibleStatus(
    context: SubscriptionCreditReconciliationInput,
  ): boolean {
    if (context.trigger === 'invoice.paid') {
      return true;
    }

    return Boolean(
      context.subscriptionStatus &&
        ACTIVE_SUBSCRIPTION_STATUSES.has(context.subscriptionStatus),
    );
  }

  private async requireCreditAllocation(
    context: SubscriptionCreditReconciliationInput & {
      organizationId: string;
    },
  ): Promise<SubscriptionCreditReconciliationContext | null> {
    const creditsToAdd = await this.resolvePlanCredits(context.subscription);
    if (creditsToAdd > 0) {
      return this.requireCreditReference({ ...context, creditsToAdd });
    }

    this.loggerService.warn(
      `${context.url} subscription credit reconciliation skipped`,
      {
        billingReason: context.billingReason,
        organizationId: context.organizationId,
        outcome: 'no_credit_allocation',
        stripeSubscriptionId: context.stripeSubscriptionId,
        subscriptionPlan: context.subscription.plan,
        trigger: context.trigger,
      },
    );
    this.creditGrantService.logUnresolvedGrant(context.url, {
      organizationId: context.organizationId,
      stripePriceId: context.subscription.stripePriceId,
    });
    return null;
  }

  private requireCreditReference(
    context: SubscriptionCreditReconciliationInput & {
      creditsToAdd: number;
      organizationId: string;
    },
  ): SubscriptionCreditReconciliationContext | null {
    const creditReference = this.resolveCreditReference(context);
    if (creditReference) {
      return { ...context, creditReference };
    }

    this.loggerService.warn(
      `${context.url} subscription credit reconciliation skipped`,
      {
        billingReason: context.billingReason,
        organizationId: context.organizationId,
        outcome: 'missing_invoice_id',
        stripeSubscriptionId: context.stripeSubscriptionId,
        trigger: context.trigger,
      },
    );
    return null;
  }

  private resolveCreditReference(
    context: SubscriptionCreditReconciliationInput,
  ): CreditReference | null {
    if (context.billingReason === 'subscription_create') {
      return {
        referenceId: `stripe-subscription:${context.stripeSubscriptionId}`,
        referenceType: SUBSCRIPTION_INITIAL_CREDIT_REFERENCE_TYPE,
      };
    }

    return context.invoiceId
      ? {
          referenceId: `stripe-invoice:${context.invoiceId}`,
          referenceType: SUBSCRIPTION_INVOICE_CREDIT_REFERENCE_TYPE,
        }
      : null;
  }

  private async reconcileContext(
    context: SubscriptionCreditReconciliationContext,
  ): Promise<boolean> {
    if (await this.hasExistingGrant(context)) {
      this.logDuplicateFromContext(context, 'existing_grant');
      return false;
    }

    try {
      await this.applyCreditTransaction(context);
    } catch (error: unknown) {
      if (!this.supportService.isUniqueConstraintError(error)) {
        throw error;
      }

      this.logDuplicateFromContext(context, 'unique_constraint_race');
      return false;
    }

    await this.recordSuccessfulReconciliation(context);
    return true;
  }

  private async hasExistingGrant(
    context: SubscriptionCreditReconciliationContext,
  ): Promise<boolean> {
    return await this.supportService.hasSubscriptionCreditGrant(
      context.organizationId,
      this.buildGrantLookup(context),
    );
  }

  private buildGrantLookup(
    context: SubscriptionCreditReconciliationContext,
  ): SubscriptionCreditGrantLookup {
    const lookup: SubscriptionCreditGrantLookup = {
      reference: context.creditReference,
    };
    this.addLegacyInvoiceReference(lookup, context);
    this.addLegacyPeriod(lookup, context);
    return lookup;
  }

  private addLegacyInvoiceReference(
    lookup: SubscriptionCreditGrantLookup,
    context: SubscriptionCreditReconciliationContext,
  ): void {
    if (context.billingReason === 'subscription_create' && context.invoiceId) {
      lookup.legacyInvoiceReference = {
        referenceId: `stripe-invoice:${context.invoiceId}`,
        referenceType: SUBSCRIPTION_INVOICE_CREDIT_REFERENCE_TYPE,
      };
    }
  }

  private addLegacyPeriod(
    lookup: SubscriptionCreditGrantLookup,
    context: SubscriptionCreditReconciliationContext,
  ): void {
    if (context.billingReason !== 'subscription_create') {
      return;
    }

    const legacyPeriod = this.resolveLegacyPeriod(context);
    if (legacyPeriod) {
      lookup.legacyPeriod = legacyPeriod;
    }
  }

  private resolveLegacyPeriod(
    context: SubscriptionCreditReconciliationContext,
  ): SubscriptionCreditGrantLookup['legacyPeriod'] {
    if (!context.periodStart) {
      return undefined;
    }
    if (!context.periodEnd) {
      return undefined;
    }
    if (!context.subscription.plan) {
      return undefined;
    }

    return {
      end: context.periodEnd,
      source: context.subscription.plan,
      start: context.periodStart,
    };
  }

  private async applyCreditTransaction(
    context: SubscriptionCreditReconciliationContext,
  ): Promise<void> {
    const transactionOptions = this.buildTransactionOptions(context);
    if (context.subscription.plan === SubscriptionPlan.MONTHLY) {
      await this.addMonthlyCredits(context, transactionOptions);
      return;
    }

    await this.resetYearlyCredits(context, transactionOptions);
  }

  private buildTransactionOptions(
    context: SubscriptionCreditReconciliationContext,
  ): CreditTransactionOptions {
    const metadata: Record<string, unknown> = {
      billingReason: context.billingReason,
      stripeSubscriptionId: context.stripeSubscriptionId,
      trigger: context.trigger,
    };
    this.addInvoiceMetadata(metadata, context);
    this.addPeriodMetadata(metadata, context);
    return { metadata, ...context.creditReference };
  }

  private addInvoiceMetadata(
    metadata: Record<string, unknown>,
    context: SubscriptionCreditReconciliationContext,
  ): void {
    if (context.invoiceId) {
      metadata.stripeInvoiceId = context.invoiceId;
    }
  }

  private addPeriodMetadata(
    metadata: Record<string, unknown>,
    context: SubscriptionCreditReconciliationContext,
  ): void {
    if (context.periodStart) {
      metadata.periodStart = context.periodStart.toISOString();
    }
    if (context.periodEnd) {
      metadata.periodEnd = context.periodEnd.toISOString();
    }
  }

  private async addMonthlyCredits(
    context: SubscriptionCreditReconciliationContext,
    transactionOptions: CreditTransactionOptions,
  ): Promise<void> {
    await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
      context.organizationId,
      context.creditsToAdd,
      SubscriptionPlan.MONTHLY,
      `${SubscriptionPlan.MONTHLY} subscription billing period`,
      new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      transactionOptions,
    );
  }

  private async resetYearlyCredits(
    context: SubscriptionCreditReconciliationContext,
    transactionOptions: CreditTransactionOptions,
  ): Promise<void> {
    await this.creditsUtilsService.resetOrganizationCredits(
      context.organizationId,
      context.creditsToAdd,
      SubscriptionPlan.YEARLY,
      `${SubscriptionPlan.YEARLY} subscription billing period reset`,
      transactionOptions,
    );
  }

  private async recordSuccessfulReconciliation(
    context: SubscriptionCreditReconciliationContext,
  ): Promise<void> {
    await this.recordCreditsActivity(context);
    const currentBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        context.organizationId,
      );
    this.logSuccessfulReconciliation(context, currentBalance);
    await this.supportService.setHasEverHadCredits(
      context.organizationId,
      context.url,
    );
  }

  private async recordCreditsActivity(
    context: SubscriptionCreditReconciliationContext,
  ): Promise<void> {
    await this.supportService.recordCreditsActivity({
      brandId: context.organizationId,
      key:
        context.subscription.plan === SubscriptionPlan.MONTHLY
          ? ActivityKey.CREDITS_ADD
          : ActivityKey.CREDITS_RESET,
      organizationId: context.organizationId,
      source: ActivitySource.SUBSCRIPTION,
      ...(context.subscription.userId
        ? { userId: context.subscription.userId }
        : {}),
      value: String(context.creditsToAdd),
    });
  }

  private logSuccessfulReconciliation(
    context: SubscriptionCreditReconciliationContext,
    currentBalance: number,
  ): void {
    this.loggerService.log(`${context.url} subscription credits reconciled`, {
      billingReason: context.billingReason,
      creditsAdded: context.creditsToAdd,
      currentBalance,
      invoiceId: context.invoiceId,
      organizationId: context.organizationId,
      outcome: 'allocated',
      policy:
        context.subscription.plan === SubscriptionPlan.MONTHLY
          ? '3-month rollover'
          : 'reset only',
      referenceId: context.creditReference.referenceId,
      referenceType: context.creditReference.referenceType,
      stripeSubscriptionId: context.stripeSubscriptionId,
      subscriptionPlan: context.subscription.plan,
      trigger: context.trigger,
    });
  }

  /**
   * The grant comes from the subscription's own Stripe price. A price we cannot
   * resolve yields 0, which the caller reports as a skipped reconciliation —
   * never a default allowance, which would grant credits unrelated to what the
   * customer actually bought.
   */
  private async resolvePlanCredits(
    subscription: Pick<ISubscriptionOssReadModel, 'plan' | 'stripePriceId'>,
  ): Promise<number> {
    const credits = await this.creditGrantService.resolvePlanCredits(
      subscription.plan,
      subscription.stripePriceId,
    );
    return credits ?? 0;
  }

  private logDuplicateFromContext(
    context: SubscriptionCreditReconciliationContext,
    outcome: DuplicateLogDetails['outcome'],
  ): void {
    this.logDuplicate({
      billingReason: context.billingReason,
      invoiceId: context.invoiceId,
      organizationId: context.organizationId,
      outcome,
      referenceId: context.creditReference.referenceId,
      referenceType: context.creditReference.referenceType,
      stripeSubscriptionId: context.stripeSubscriptionId,
      trigger: context.trigger,
      url: context.url,
    });
  }

  private logDuplicate(details: DuplicateLogDetails): void {
    const { url, ...metadata } = details;
    this.loggerService.log(
      `${url} subscription credit reconciliation skipped`,
      metadata,
    );
  }
}
