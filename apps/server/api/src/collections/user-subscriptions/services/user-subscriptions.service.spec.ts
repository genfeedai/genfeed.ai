import type { UserSubscriptionDocument } from '@api/collections/user-subscriptions/schemas/user-subscription.schema';
import { UserSubscriptionsService } from '@api/collections/user-subscriptions/services/user-subscriptions.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SubscriptionStatus } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import type StripeConstructor from 'stripe';
import { beforeEach, describe, expect, it } from 'vitest';

type StripeClient = InstanceType<typeof StripeConstructor>;
type CheckoutSession = Awaited<
  ReturnType<StripeClient['checkout']['sessions']['create']>
>;

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

const session = (subscription: string | null) =>
  ({ subscription }) as unknown as CheckoutSession;

describe('UserSubscriptionsService', () => {
  let rows: UserSubscriptionDocument[];
  let isDatabaseDown: boolean;
  let errors: string[];
  let warnings: string[];
  let service: UserSubscriptionsService;

  const row = () => rows[0];
  const seed = (fields: Partial<UserSubscriptionDocument> = {}) => {
    rows.push({
      cancelAtPeriodEnd: false,
      createdAt: CREATED_AT,
      currentPeriodEnd: null,
      currentPeriodStart: null,
      id: 'usub_1',
      isDeleted: false,
      plan: null,
      status: SubscriptionStatus.ACTIVE,
      stripePriceId: null,
      stripeSubscriptionId: null,
      updatedAt: CREATED_AT,
      userId: 'user_1',
      ...fields,
    });
  };

  beforeEach(() => {
    rows = [];
    isDatabaseDown = false;
    errors = [];
    warnings = [];

    // The user_subscriptions table: `userId` is unique, as in the schema.
    const userSubscription = {
      create: async ({ data }: { data: Partial<UserSubscriptionDocument> }) => {
        if (isDatabaseDown) throw new Error('database unavailable');
        if (rows.some(({ userId }) => userId === data.userId)) {
          throw Object.assign(new Error('Unique constraint failed on userId'), {
            code: 'P2002',
          });
        }
        seed({ ...data, id: `usub_${rows.length + 1}` });
        return { ...rows[rows.length - 1] };
      },
      findUnique: async ({ where }: { where: { userId: string } }) => {
        const found = rows.find(({ userId }) => userId === where.userId);
        return found ? { ...found } : null;
      },
      update: async ({
        data,
        where,
      }: {
        data: Partial<UserSubscriptionDocument>;
        where: { id: string };
      }) => {
        if (isDatabaseDown) throw new Error('row locked');
        const found = rows.find(({ id }) => id === where.id);
        if (!found) throw new Error('Record to update not found');
        return { ...Object.assign(found, data) };
      },
    };

    service = new UserSubscriptionsService(
      { userSubscription } as unknown as PrismaService,
      {
        debug: () => undefined,
        error: (message: string) => {
          errors.push(message);
        },
        log: () => undefined,
        warn: (message: string) => {
          warnings.push(message);
        },
      } as unknown as LoggerService,
    );
  });

  describe('create', () => {
    it('stores the subscription row', async () => {
      await service.create({
        cancelAtPeriodEnd: false,
        isDeleted: false,
        status: SubscriptionStatus.ACTIVE,
        userId: 'user_1',
      });

      expect(rows).toEqual([
        expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          userId: 'user_1',
        }),
      ]);
    });

    it('rethrows when the database refuses the row', async () => {
      seed();

      await expect(service.create({ userId: 'user_1' })).rejects.toThrow(
        'Unique constraint failed on userId',
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('findByUser', () => {
    it('returns the live subscription for the user', async () => {
      seed();

      await expect(service.findByUser('user_1')).resolves.toMatchObject({
        id: 'usub_1',
      });
    });

    it.each([
      ['a soft-deleted row', { isDeleted: true }],
      ['another user', { userId: 'user_2' }],
    ])('treats %s as missing', async (_case, fields) => {
      seed(fields);

      await expect(service.findByUser('user_1')).resolves.toBeNull();
    });
  });

  describe('getOrCreateSubscription', () => {
    it('returns the existing subscription without creating a second one', async () => {
      seed({ stripeSubscriptionId: 'sub_live' });

      await expect(
        service.getOrCreateSubscription('user_1'),
      ).resolves.toMatchObject({
        id: 'usub_1',
        stripeSubscriptionId: 'sub_live',
      });
      expect(rows).toHaveLength(1);
    });

    it('creates an ACTIVE subscription when none exists', async () => {
      await service.getOrCreateSubscription('user_1');

      expect(rows).toEqual([
        expect.objectContaining({
          cancelAtPeriodEnd: false,
          isDeleted: false,
          status: SubscriptionStatus.ACTIVE,
          userId: 'user_1',
        }),
      ]);
    });

    it('revives a soft-deleted row as a fresh subscription', async () => {
      seed({
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date('2026-05-01T00:00:00.000Z'),
        isDeleted: true,
        plan: 'pro',
        status: SubscriptionStatus.CANCELLED,
        stripePriceId: 'price_old',
        stripeSubscriptionId: 'sub_old',
      });

      await expect(
        service.getOrCreateSubscription('user_1'),
      ).resolves.toMatchObject({ id: 'usub_1', isDeleted: false });
      expect(rows).toEqual([
        {
          cancelAtPeriodEnd: false,
          createdAt: CREATED_AT,
          currentPeriodEnd: null,
          currentPeriodStart: null,
          id: 'usub_1',
          isDeleted: false,
          plan: null,
          status: SubscriptionStatus.ACTIVE,
          stripePriceId: null,
          stripeSubscriptionId: null,
          updatedAt: CREATED_AT,
          userId: 'user_1',
        },
      ]);
    });
  });

  describe('updateFromStripeSession', () => {
    it.each([
      ['stores the Stripe subscription id', 'sub_live', 'sub_live'],
      ['leaves the row as it is without one', null, null],
    ])('%s from the checkout session', async (_case, sessionSub, stored) => {
      seed();

      await service.updateFromStripeSession('user_1', session(sessionSub));

      expect(row()?.stripeSubscriptionId).toBe(stored);
    });

    it('warns and returns null when the user has no subscription', async () => {
      await expect(
        service.updateFromStripeSession('user_1', session('sub_live')),
      ).resolves.toBeNull();
      expect(warnings).toEqual([
        'UserSubscriptionsService updateFromStripeSession: no subscription found',
      ]);
      expect(rows).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    it('stores the SCREAMING_SNAKE Prisma status label', async () => {
      seed();

      await service.updateStatus('user_1', SubscriptionStatus.PAST_DUE);

      expect(row()?.status).toBe('PAST_DUE');
    });

    it.each([
      [
        'the period end and cancel-at-period-end when supplied',
        new Date('2026-09-01T00:00:00.000Z'),
        true,
        {
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
        },
      ],
      [
        'a falsy cancelAtPeriodEnd=false',
        undefined,
        false,
        { cancelAtPeriodEnd: false, currentPeriodEnd: null },
      ],
    ])('stores %s', async (_case, periodEnd, cancelAtPeriodEnd, expected) => {
      seed({ cancelAtPeriodEnd: true });

      await service.updateStatus(
        'user_1',
        SubscriptionStatus.CANCELLED,
        periodEnd,
        cancelAtPeriodEnd,
      );

      expect(row()).toMatchObject({
        ...expected,
        status: SubscriptionStatus.CANCELLED,
      });
    });

    it('returns null when the user has no subscription', async () => {
      await expect(
        service.updateStatus('user_1', SubscriptionStatus.ACTIVE),
      ).resolves.toBeNull();
      expect(rows).toEqual([]);
    });
  });

  describe('delete', () => {
    it('soft-deletes via isDeleted rather than removing the row', async () => {
      seed();

      await service.delete('usub_1');

      expect(rows).toEqual([expect.objectContaining({ isDeleted: true })]);
    });

    it('logs and rethrows when the soft delete fails', async () => {
      seed();
      isDatabaseDown = true;

      await expect(service.delete('usub_1')).rejects.toThrow('row locked');
      expect(errors).toEqual(['UserSubscriptionsService delete failed']);
      expect(row()?.isDeleted).toBe(false);
    });
  });
});
