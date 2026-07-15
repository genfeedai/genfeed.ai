import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import {
  ActivityKey,
  ActivitySource,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@genfeedai/enums';
import type { ISubscriptionOssReadModel } from '@genfeedai/interfaces/billing';
import { TIER_INCLUDED_MONTHLY_CREDITS } from '@genfeedai/pricing';
import { ConfigService } from '@libs/config/config.service';
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

/**
 * Converges subscription.created and invoice.paid onto one durable initial
 * credit grant while preserving invoice-keyed grants for later billing cycles.
 */
@Injectable()
export class StripeSubscriptionCreditReconcilerService {
  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly supportService: StripeWebhookSupportService,
  ) {}

  async reconcile({
    billingReason,
    invoiceId,
    periodEnd,
    periodStart,
    stripeSubscriptionId,
    subscription,
    subscriptionStatus,
    trigger,
    url,
  }: SubscriptionCreditReconciliationInput): Promise<boolean> {
    const organizationId = subscription.organization
      ? String(subscription.organization)
      : '';

    if (!organizationId) {
      this.loggerService.warn(
        `${url} subscription credit reconciliation skipped`,
        {
          billingReason,
          outcome: 'missing_organization',
          stripeSubscriptionId,
          trigger,
        },
      );
      return false;
    }

    if (
      trigger === 'customer.subscription.created' &&
      (!subscriptionStatus ||
        !ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus))
    ) {
      this.loggerService.log(
        `${url} subscription credit reconciliation skipped`,
        {
          billingReason,
          organizationId,
          outcome: 'ineligible_status',
          status: subscriptionStatus,
          stripeSubscriptionId,
          trigger,
        },
      );
      return false;
    }

    const creditsToAdd = this.resolvePlanCredits(subscription);
    if (creditsToAdd <= 0) {
      this.loggerService.warn(
        `${url} subscription credit reconciliation skipped`,
        {
          billingReason,
          organizationId,
          outcome: 'no_credit_allocation',
          stripeSubscriptionId,
          subscriptionType: subscription.type,
          trigger,
        },
      );
      return false;
    }

    const creditReference =
      billingReason === 'subscription_create'
        ? {
            referenceId: `stripe-subscription:${stripeSubscriptionId}`,
            referenceType: SUBSCRIPTION_INITIAL_CREDIT_REFERENCE_TYPE,
          }
        : invoiceId
          ? {
              referenceId: `stripe-invoice:${invoiceId}`,
              referenceType: SUBSCRIPTION_INVOICE_CREDIT_REFERENCE_TYPE,
            }
          : null;

    if (!creditReference) {
      this.loggerService.warn(
        `${url} subscription credit reconciliation skipped`,
        {
          billingReason,
          organizationId,
          outcome: 'missing_invoice_id',
          stripeSubscriptionId,
          trigger,
        },
      );
      return false;
    }

    const legacyInvoiceReference =
      billingReason === 'subscription_create' && invoiceId
        ? {
            referenceId: `stripe-invoice:${invoiceId}`,
            referenceType: SUBSCRIPTION_INVOICE_CREDIT_REFERENCE_TYPE,
          }
        : undefined;

    if (
      await this.supportService.hasSubscriptionCreditGrant(organizationId, {
        ...(legacyInvoiceReference ? { legacyInvoiceReference } : {}),
        ...(billingReason === 'subscription_create' &&
        periodStart &&
        periodEnd &&
        subscription.type
          ? {
              legacyPeriod: {
                end: periodEnd,
                source: subscription.type,
                start: periodStart,
              },
            }
          : {}),
        reference: creditReference,
      })
    ) {
      this.logDuplicate({
        billingReason,
        invoiceId,
        organizationId,
        outcome: 'existing_grant',
        referenceId: creditReference.referenceId,
        referenceType: creditReference.referenceType,
        stripeSubscriptionId,
        trigger,
        url,
      });
      return false;
    }

    const transactionOptions = {
      metadata: {
        billingReason,
        ...(invoiceId ? { stripeInvoiceId: invoiceId } : {}),
        ...(periodEnd ? { periodEnd: periodEnd.toISOString() } : {}),
        ...(periodStart ? { periodStart: periodStart.toISOString() } : {}),
        stripeSubscriptionId,
        trigger,
      },
      ...creditReference,
    };

    try {
      if (subscription.type === SubscriptionPlan.MONTHLY) {
        await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
          organizationId,
          creditsToAdd,
          subscription.type,
          `${subscription.type} subscription billing period`,
          new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          transactionOptions,
        );
      } else if (subscription.type === SubscriptionPlan.YEARLY) {
        await this.creditsUtilsService.resetOrganizationCredits(
          organizationId,
          creditsToAdd,
          subscription.type,
          `${subscription.type} subscription billing period reset`,
          transactionOptions,
        );
      }
    } catch (error: unknown) {
      if (this.supportService.isUniqueConstraintError(error)) {
        this.logDuplicate({
          billingReason,
          invoiceId,
          organizationId,
          outcome: 'unique_constraint_race',
          referenceId: creditReference.referenceId,
          referenceType: creditReference.referenceType,
          stripeSubscriptionId,
          trigger,
          url,
        });
        return false;
      }
      throw error;
    }

    const activityKey =
      subscription.type === SubscriptionPlan.MONTHLY
        ? ActivityKey.CREDITS_ADD
        : ActivityKey.CREDITS_RESET;

    await this.supportService.recordCreditsActivity({
      brandId: organizationId,
      key: activityKey,
      organizationId,
      source: ActivitySource.SUBSCRIPTION,
      ...(subscription.user ? { userId: String(subscription.user) } : {}),
      value: String(creditsToAdd),
    });

    const currentBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );

    this.loggerService.log(`${url} subscription credits reconciled`, {
      billingReason,
      creditsAdded: creditsToAdd,
      currentBalance,
      invoiceId,
      organizationId,
      outcome: 'allocated',
      policy:
        subscription.type === SubscriptionPlan.MONTHLY
          ? '3-month rollover'
          : 'reset only',
      referenceId: creditReference.referenceId,
      referenceType: creditReference.referenceType,
      stripeSubscriptionId,
      subscriptionType: subscription.type,
      trigger,
    });

    await this.supportService.setHasEverHadCredits(organizationId, url);
    return true;
  }

  private resolvePlanCredits(
    subscription: Pick<ISubscriptionOssReadModel, 'stripePriceId' | 'type'>,
  ): number {
    const tier = subscription.stripePriceId
      ? this.supportService.resolveTierFromPriceId(subscription.stripePriceId)
      : null;
    const tierMonthlyCredits = tier
      ? TIER_INCLUDED_MONTHLY_CREDITS[tier]
      : undefined;

    if (subscription.type === SubscriptionPlan.MONTHLY) {
      return (
        tierMonthlyCredits ??
        (Number(this.configService.get('STRIPE_MONTHLY_CREDITS')) || 35_000)
      );
    }

    if (subscription.type === SubscriptionPlan.YEARLY) {
      return tierMonthlyCredits != null
        ? tierMonthlyCredits * 12
        : Number(this.configService.get('STRIPE_YEARLY_CREDITS')) || 500_000;
    }

    return 0;
  }

  private logDuplicate(details: {
    billingReason: string;
    invoiceId?: string;
    organizationId: string;
    outcome: 'existing_grant' | 'unique_constraint_race';
    referenceId: string;
    referenceType: string;
    stripeSubscriptionId: string;
    trigger: SubscriptionCreditTrigger;
    url: string;
  }): void {
    const { url, ...metadata } = details;
    this.loggerService.log(
      `${url} subscription credit reconciliation skipped`,
      metadata,
    );
  }
}
