import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { StripeWebhookBillingError } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.error';
import { BILLING_ACCOUNT_METADATA } from '@api/services/integrations/stripe/services/billing-account-metadata.constant';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BillingAccountOrganizationStatus } from '@genfeedai/contracts';
import type { Prisma, Subscription } from '@genfeedai/prisma';
import { HttpException, Injectable } from '@nestjs/common';

type BillingIdentityInput = {
  customer: unknown;
  stripeSubscriptionId: unknown;
  metadata?: Record<string, string> | null;
};

type ResolvedBillingIdentity = {
  subscription: Subscription;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  customerBillingAccountId: string | null;
  billingAccountId: string;
};

export type StripeWebhookSubscriptionPatch = Pick<
  Subscription,
  'status' | 'stripeSubscriptionId'
> &
  Partial<
    Pick<
      Subscription,
      | 'cancelAtPeriodEnd'
      | 'currentPeriodEnd'
      | 'currentPeriodStart'
      | 'stripePriceId'
      | 'plan'
    >
  >;

function isNonemptyId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Stripe omits or nulls a period boundary the same way (absent), while zero is
 * a real Unix timestamp. Anything else that is not a finite number is malformed.
 */
export function stripeWebhookPeriod(value: unknown): Date | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new StripeWebhookBillingError('invalid_payload');
  }
  const date = new Date(value * 1000);
  if (!Number.isFinite(date.getTime())) {
    throw new StripeWebhookBillingError('invalid_payload');
  }
  return date;
}

@Injectable()
export class StripeWebhookBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingAccountsService: BillingAccountsService,
  ) {}

  async resolve(input: BillingIdentityInput): Promise<ResolvedBillingIdentity> {
    const stripeCustomerId =
      typeof input.customer === 'string'
        ? input.customer
        : input.customer &&
            typeof input.customer === 'object' &&
            'id' in input.customer
          ? input.customer.id
          : undefined;
    if (
      !isNonemptyId(stripeCustomerId) ||
      !isNonemptyId(input.stripeSubscriptionId)
    ) {
      throw new StripeWebhookBillingError('invalid_payload');
    }
    // tenant-scope-ignore: signed provider subscription identity establishes the organization scope below
    let candidates = await this.prisma.subscription.findMany({
      take: 2,
      where: {
        isDeleted: false,
        stripeSubscriptionId: input.stripeSubscriptionId,
      },
    });
    this.assertUnambiguous(candidates);
    if (!candidates.length) {
      // tenant-scope-ignore: signed provider customer identity establishes the organization scope below
      const customers = await this.prisma.customer.findMany({
        take: 2,
        where: { isDeleted: false, stripeCustomerId },
      });
      this.assertUnambiguous(customers);
      if (customers.length) {
        candidates = await this.prisma.subscription.findMany({
          take: 2,
          where: {
            customerId: customers[0].id,
            organizationId: customers[0].organizationId,
            isDeleted: false,
          },
        });
        this.assertUnambiguous(candidates);
      }
    }
    if (!candidates.length) {
      const organizationId =
        input.metadata?.[BILLING_ACCOUNT_METADATA.organizationId];
      if (
        !isNonemptyId(organizationId) ||
        !isNonemptyId(
          input.metadata?.[BILLING_ACCOUNT_METADATA.billingAccountId],
        ) ||
        input.metadata?.[BILLING_ACCOUNT_METADATA.type] !== 'billing_account'
      ) {
        throw new StripeWebhookBillingError('identity_missing');
      }
      candidates = await this.prisma.subscription.findMany({
        take: 2,
        where: { organizationId, isDeleted: false },
      });
      this.assertUnambiguous(candidates);
    }
    const subscription = candidates[0];
    if (
      !subscription ||
      subscription.isDeleted ||
      ![
        subscription.id,
        subscription.organizationId,
        subscription.userId,
        subscription.customerId,
      ].every(isNonemptyId)
    ) {
      throw new StripeWebhookBillingError('identity_missing');
    }
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: subscription.customerId as string,
        organizationId: subscription.organizationId,
        isDeleted: false,
      },
    });
    if (!customer || customer.isDeleted)
      throw new StripeWebhookBillingError('identity_missing');
    if (
      customer.id !== subscription.customerId ||
      customer.organizationId !== subscription.organizationId ||
      customer.stripeCustomerId !== stripeCustomerId
    ) {
      throw new StripeWebhookBillingError('identity_conflict');
    }
    const account = await this.resolveAccount(subscription.organizationId);
    if (!account || account.isDeleted || !isNonemptyId(account.id)) {
      throw new StripeWebhookBillingError('identity_missing');
    }
    if (
      (subscription.billingAccountId !== null &&
        subscription.billingAccountId !== account.id) ||
      (customer.billingAccountId !== null &&
        customer.billingAccountId !== account.id) ||
      (account.stripeCustomerId !== null &&
        account.stripeCustomerId !== stripeCustomerId) ||
      (subscription.stripeSubscriptionId !== null &&
        subscription.stripeSubscriptionId !== input.stripeSubscriptionId)
    ) {
      throw new StripeWebhookBillingError('identity_conflict');
    }
    const metadataType = input.metadata?.[BILLING_ACCOUNT_METADATA.type];
    if (
      metadataType !== undefined &&
      metadataType !== 'organization' &&
      metadataType !== 'billing_account'
    ) {
      throw new StripeWebhookBillingError('identity_conflict');
    }
    const expectedMetadata = {
      [BILLING_ACCOUNT_METADATA.organizationId]: subscription.organizationId,
      organizationId: subscription.organizationId,
      [BILLING_ACCOUNT_METADATA.billingAccountId]: account.id,
    };
    for (const [key, value] of Object.entries(expectedMetadata)) {
      if (
        input.metadata?.[key] !== undefined &&
        input.metadata[key] !== value
      ) {
        throw new StripeWebhookBillingError('identity_conflict');
      }
    }
    return {
      subscription,
      stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      customerBillingAccountId: customer.billingAccountId,
      billingAccountId: account.id,
    };
  }

  async persist(
    identity: ResolvedBillingIdentity,
    patch: StripeWebhookSubscriptionPatch,
  ) {
    const {
      subscription,
      stripeCustomerId,
      customerBillingAccountId,
      billingAccountId,
    } = identity;
    const data = {
      cancelAtPeriodEnd: patch.cancelAtPeriodEnd,
      currentPeriodEnd: patch.currentPeriodEnd,
      currentPeriodStart: patch.currentPeriodStart,
      plan: patch.plan,
      status: patch.status,
      stripePriceId: patch.stripePriceId,
      stripeSubscriptionId: patch.stripeSubscriptionId,
    } satisfies Prisma.SubscriptionUpdateManyMutationInput;
    try {
      const result = await this.prisma.subscription.updateMany({
        data,
        where: {
          organization: {
            is: {
              isDeleted: false,
              OR: [
                {
                  billingAccountId,
                  billingAccount: {
                    is: {
                      isDeleted: false,
                      OR: [{ stripeCustomerId: null }, { stripeCustomerId }],
                    },
                  },
                },
                {
                  billingAccountId: null,
                  billingAccountLinks: {
                    some: {
                      billingAccountId,
                      isDeleted: false,
                      status: BillingAccountOrganizationStatus.LINKED,
                      billingAccount: {
                        is: {
                          isDeleted: false,
                          OR: [
                            { stripeCustomerId: null },
                            { stripeCustomerId },
                          ],
                        },
                      },
                    },
                    none: {
                      billingAccountId: { not: billingAccountId },
                      isDeleted: false,
                      status: BillingAccountOrganizationStatus.LINKED,
                    },
                  },
                },
              ],
            },
          },
          id: subscription.id,
          organizationId: subscription.organizationId,
          isDeleted: false,
          customerId: subscription.customerId,
          billingAccountId: subscription.billingAccountId,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          customer: {
            is: {
              id: subscription.customerId as string,
              organizationId: subscription.organizationId,
              isDeleted: false,
              stripeCustomerId,
              billingAccountId: customerBillingAccountId,
            },
          },
        },
      });
      if (result.count !== 1)
        throw new StripeWebhookBillingError('identity_conflict');
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new StripeWebhookBillingError('identity_conflict');
      }
      throw error;
    }
    return { ...subscription, ...patch };
  }

  private assertUnambiguous(candidates: unknown[]): void {
    if (candidates.length > 1)
      throw new StripeWebhookBillingError('identity_ambiguous');
  }

  private async resolveAccount(organizationId: string) {
    try {
      return await this.billingAccountsService.resolveForOrganization(
        organizationId,
      );
    } catch (error) {
      if (
        error instanceof HttpException &&
        [404, 409].includes(error.getStatus())
      ) {
        throw new StripeWebhookBillingError(
          error.getStatus() === 404 ? 'identity_missing' : 'identity_conflict',
        );
      }
      throw error;
    }
  }
}
