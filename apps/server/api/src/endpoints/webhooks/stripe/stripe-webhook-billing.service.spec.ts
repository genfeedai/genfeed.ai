import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import {
  StripeWebhookBillingService,
  stripeWebhookPeriod,
} from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscription = {
  id: 'sub_db',
  organizationId: 'org_1',
  userId: 'user_1',
  customerId: 'customer_1',
  billingAccountId: null,
  stripeSubscriptionId: null,
  isDeleted: false,
};
const customer = {
  id: 'customer_1',
  organizationId: 'org_1',
  stripeCustomerId: 'cus_1',
  billingAccountId: null,
  isDeleted: false,
};
const account = { id: 'ba_1', stripeCustomerId: null, isDeleted: false };
const input = { customer: 'cus_1', stripeSubscriptionId: 'sub_1' };
const metadata = {
  billing_organization_id: 'org_1',
  billing_account_id: 'ba_1',
  billing_account_type: 'billing_account',
};

describe('StripeWebhookBillingService', () => {
  const prisma = {
    subscription: { findMany: vi.fn(), updateMany: vi.fn() },
    customer: { findMany: vi.fn(), findFirst: vi.fn() },
  };
  const accounts = { resolveForOrganization: vi.fn() };
  const service = new StripeWebhookBillingService(
    prisma as unknown as PrismaService,
    accounts as unknown as BillingAccountsService,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.subscription.findMany.mockResolvedValue([subscription]);
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.customer.findMany.mockResolvedValue([customer]);
    prisma.customer.findFirst.mockResolvedValue(customer);
    accounts.resolveForOrganization.mockResolvedValue(account);
  });

  it.each(['cus_1', { id: 'cus_1' }])(
    'resolves metadata-free persisted identity: %j',
    async (reference) => {
      expect(await service.resolve({ ...input, customer: reference })).toEqual({
        subscription,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        customerBillingAccountId: null,
        billingAccountId: 'ba_1',
      });
    },
  );
  it.each(['subscription', 'customer'])(
    'accepts production checkout organization metadata through persisted %s identity',
    async (path) => {
      if (path === 'customer')
        prisma.subscription.findMany.mockResolvedValueOnce([]);
      await expect(
        service.resolve({
          ...input,
          metadata: {
            billing_account_type: 'organization',
            billing_organization_id: 'org_1',
          },
        }),
      ).resolves.toMatchObject({ billingAccountId: 'ba_1' });
    },
  );
  it('does not use the organization marker as metadata-only routing authority', async () => {
    prisma.subscription.findMany.mockResolvedValue([]);
    prisma.customer.findMany.mockResolvedValue([]);
    await expect(
      service.resolve({
        ...input,
        metadata: { ...metadata, billing_account_type: 'organization' },
      }),
    ).rejects.toMatchObject({ code: 'identity_missing' });
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });
  it.each(['billing_organization_id', 'organizationId', 'billing_account_id'])(
    'rejects mismatched %s with production organization metadata',
    async (key) => {
      await expect(
        service.resolve({
          ...input,
          metadata: {
            billing_account_type: 'organization',
            billing_organization_id: 'org_1',
            [key]: 'other',
          },
        }),
      ).rejects.toMatchObject({ code: 'identity_conflict' });
    },
  );
  it('uses bounded scoped persisted-customer fallback without provider metadata', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([]);
    await service.resolve(input);
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      take: 2,
      where: { isDeleted: false, stripeCustomerId: 'cus_1' },
    });
    expect(prisma.subscription.findMany).toHaveBeenLastCalledWith({
      take: 2,
      where: {
        customerId: 'customer_1',
        organizationId: 'org_1',
        isDeleted: false,
      },
    });
  });
  it('accepts complete canonical metadata fallback only after validating persisted identity', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([]);
    prisma.customer.findMany.mockResolvedValue([]);
    await service.resolve({ ...input, metadata });
    expect(prisma.subscription.findMany).toHaveBeenLastCalledWith({
      take: 2,
      where: { organizationId: 'org_1', isDeleted: false },
    });
    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer_1', organizationId: 'org_1', isDeleted: false },
    });
  });
  it.each([undefined, null, '', ' ', {}, { id: undefined }, { id: 1 }])(
    'rejects invalid customer identifier %j before database work',
    async (reference) => {
      await expect(
        service.resolve({ ...input, customer: reference }),
      ).rejects.toMatchObject({ code: 'invalid_payload' });
      expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, null, '', ' ', {}])(
    'rejects invalid subscription identifier %j',
    async (id) => {
      await expect(
        service.resolve({ ...input, stripeSubscriptionId: id }),
      ).rejects.toMatchObject({ code: 'invalid_payload' });
    },
  );
  it.each(['id', 'organizationId', 'userId', 'customerId'])(
    'requires canonical subscription scalar %s',
    async (key) => {
      prisma.subscription.findMany.mockResolvedValue([
        { ...subscription, [key]: '' },
      ]);
      await expect(service.resolve(input)).rejects.toMatchObject({
        code: 'identity_missing',
      });
    },
  );
  it.each([
    ['missing subscription', null, customer, account, 'identity_missing'],
    [
      'deleted subscription',
      { ...subscription, isDeleted: true },
      customer,
      account,
      'identity_missing',
    ],
    ['missing customer', subscription, null, account, 'identity_missing'],
    [
      'deleted customer',
      subscription,
      { ...customer, isDeleted: true },
      account,
      'identity_missing',
    ],
    [
      'customer id conflict',
      subscription,
      { ...customer, id: 'other' },
      account,
      'identity_conflict',
    ],
    [
      'customer organization conflict',
      subscription,
      { ...customer, organizationId: 'other' },
      account,
      'identity_conflict',
    ],
    [
      'customer Stripe conflict',
      subscription,
      { ...customer, stripeCustomerId: 'other' },
      account,
      'identity_conflict',
    ],
    [
      'customer account conflict',
      subscription,
      { ...customer, billingAccountId: 'other' },
      account,
      'identity_conflict',
    ],
    [
      'subscription account conflict',
      { ...subscription, billingAccountId: 'other' },
      customer,
      account,
      'identity_conflict',
    ],
    [
      'subscription Stripe conflict',
      { ...subscription, stripeSubscriptionId: 'other' },
      customer,
      account,
      'identity_conflict',
    ],
    ['missing account', subscription, customer, null, 'identity_missing'],
    [
      'deleted account',
      subscription,
      customer,
      { ...account, isDeleted: true },
      'identity_missing',
    ],
    [
      'account customer conflict',
      subscription,
      customer,
      { ...account, stripeCustomerId: 'other' },
      'identity_conflict',
    ],
  ])('rejects %s without mutation', async (_name, sub, cust, billing, code) => {
    prisma.subscription.findMany.mockResolvedValue(sub ? [sub] : []);
    prisma.customer.findFirst.mockResolvedValue(cust);
    accounts.resolveForOrganization.mockResolvedValue(billing);
    await expect(service.resolve(input)).rejects.toMatchObject({ code });
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    'organizationId',
    'billing_organization_id',
    'billing_account_id',
    'billing_account_type',
  ])('rejects conflicting metadata %s on persisted path', async (key) => {
    await expect(
      service.resolve({ ...input, metadata: { [key]: 'other' } }),
    ).rejects.toMatchObject({ code: 'identity_conflict' });
  });
  it.each([
    'billing_organization_id',
    'billing_account_id',
    'billing_account_type',
  ])('requires fallback marker %s', async (key) => {
    prisma.subscription.findMany.mockResolvedValue([]);
    prisma.customer.findMany.mockResolvedValue([]);
    await expect(
      service.resolve({ ...input, metadata: { ...metadata, [key]: '' } }),
    ).rejects.toMatchObject({ code: 'identity_missing' });
  });
  it.each(['subscription', 'customer', 'organization'])(
    'rejects ambiguous %s mapping',
    async (path) => {
      if (path === 'subscription')
        prisma.subscription.findMany.mockResolvedValue([
          subscription,
          subscription,
        ]);
      else {
        prisma.subscription.findMany.mockResolvedValueOnce([]);
        if (path === 'customer')
          prisma.customer.findMany.mockResolvedValue([customer, customer]);
        else {
          prisma.customer.findMany.mockResolvedValue([]);
          prisma.subscription.findMany.mockResolvedValueOnce([
            subscription,
            subscription,
          ]);
        }
      }
      await expect(
        service.resolve({ ...input, metadata }),
      ).rejects.toMatchObject({ code: 'identity_ambiguous' });
      expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each([new NotFoundException('BillingAccount'), new ConflictException()])(
    'classifies only known account resolution errors',
    async (error) => {
      accounts.resolveForOrganization.mockRejectedValue(error);
      await expect(service.resolve(input)).rejects.toMatchObject({
        code:
          error.getStatus() === 404 ? 'identity_missing' : 'identity_conflict',
      });
    },
  );
  it('propagates unrelated database failure', async () => {
    const error = new Error('database unavailable');
    accounts.resolveForOrganization.mockRejectedValue(error);
    await expect(service.resolve(input)).rejects.toBe(error);
  });
  it('writes only typed patch fields under all observed identity guards', async () => {
    const identity = await service.resolve(input);
    const patch = {
      status: 'ACTIVE' as const,
      stripeSubscriptionId: 'sub_1',
      currentPeriodStart: new Date(0),
    };
    expect(await service.persist(identity, patch)).toEqual({
      ...subscription,
      ...patch,
    });
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      data: {
        cancelAtPeriodEnd: undefined,
        currentPeriodEnd: undefined,
        currentPeriodStart: new Date(0),
        plan: undefined,
        status: 'ACTIVE',
        stripePriceId: undefined,
        stripeSubscriptionId: 'sub_1',
      },
      where: {
        id: 'sub_db',
        organizationId: 'org_1',
        isDeleted: false,
        customerId: 'customer_1',
        billingAccountId: null,
        stripeSubscriptionId: null,
        customer: {
          is: {
            id: 'customer_1',
            organizationId: 'org_1',
            isDeleted: false,
            stripeCustomerId: 'cus_1',
            billingAccountId: null,
          },
        },
        organization: {
          is: {
            isDeleted: false,
            OR: [
              {
                billingAccountId: 'ba_1',
                billingAccount: {
                  is: {
                    isDeleted: false,
                    OR: [
                      { stripeCustomerId: null },
                      { stripeCustomerId: 'cus_1' },
                    ],
                  },
                },
              },
              {
                billingAccountId: null,
                billingAccountLinks: {
                  some: {
                    billingAccountId: 'ba_1',
                    isDeleted: false,
                    status: 'LINKED',
                    billingAccount: {
                      is: {
                        isDeleted: false,
                        OR: [
                          { stripeCustomerId: null },
                          { stripeCustomerId: 'cus_1' },
                        ],
                      },
                    },
                  },
                  none: {
                    billingAccountId: { not: 'ba_1' },
                    isDeleted: false,
                    status: 'LINKED',
                  },
                },
              },
            ],
          },
        },
      },
    });
  });
  it.each([0, 2])('rejects guarded write count %s', async (count) => {
    prisma.subscription.updateMany.mockResolvedValue({ count });
    await expect(
      service.persist(await service.resolve(input), {
        status: 'ACTIVE',
        stripeSubscriptionId: 'sub_1',
      }),
    ).rejects.toMatchObject({ code: 'identity_conflict' });
  });
  it('classifies persistence P2002 as retryable conflict while preserving other failures', async () => {
    const identity = await service.resolve(input);
    prisma.subscription.updateMany.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      service.persist(identity, {
        status: 'ACTIVE',
        stripeSubscriptionId: 'sub_1',
      }),
    ).rejects.toMatchObject({ code: 'identity_conflict' });
    const error = new Error('db failed');
    prisma.subscription.updateMany.mockRejectedValueOnce(error);
    await expect(
      service.persist(identity, {
        status: 'ACTIVE',
        stripeSubscriptionId: 'sub_1',
      }),
    ).rejects.toBe(error);
  });
  it.each(['', NaN, Infinity, 1e30, true, {}])(
    'rejects invalid timestamp %j',
    (value) => {
      expect(() => stripeWebhookPeriod(value)).toThrow();
    },
  );
  it.each([undefined, null])(
    'treats an absent timestamp %j as no period boundary',
    (value) => {
      expect(stripeWebhookPeriod(value)).toBeUndefined();
    },
  );
  it('keeps zero as the Unix epoch', () => {
    expect(stripeWebhookPeriod(0)).toEqual(new Date(0));
  });
});
