import type { UserSubscriptionDocument } from '@api/collections/user-subscriptions/schemas/user-subscription.schema';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SubscriptionStatus } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import type StripeConstructor from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserSubscriptionsService } from './user-subscriptions.service';

type StripeClient = InstanceType<typeof StripeConstructor>;
type CheckoutSession = Awaited<
  ReturnType<StripeClient['checkout']['sessions']['create']>
>;

type MockFn = ReturnType<typeof vi.fn>;

interface UserSubscriptionDelegate {
  create: MockFn;
  findUnique: MockFn;
  update: MockFn;
}

function buildSubscription(
  overrides: Partial<UserSubscriptionDocument> = {},
): UserSubscriptionDocument {
  return {
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    currentPeriodEnd: null,
    currentPeriodStart: null,
    id: 'usub_1',
    isDeleted: false,
    plan: null,
    status: SubscriptionStatus.ACTIVE,
    stripePriceId: null,
    stripeSubscriptionId: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'user_1',
    ...overrides,
  };
}

describe('UserSubscriptionsService', () => {
  let delegate: UserSubscriptionDelegate;
  let logger: { error: MockFn; log: MockFn; warn: MockFn; debug: MockFn };
  let service: UserSubscriptionsService;

  beforeEach(() => {
    delegate = {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    };
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    service = new UserSubscriptionsService(
      { userSubscription: delegate } as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
  });

  describe('create', () => {
    it('persists the subscription row through Prisma', async () => {
      const created = buildSubscription();
      delegate.create.mockResolvedValue(created);

      const result = await service.create({
        cancelAtPeriodEnd: false,
        isDeleted: false,
        status: SubscriptionStatus.ACTIVE,
        userId: 'user_1',
      });

      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          cancelAtPeriodEnd: false,
          isDeleted: false,
          status: SubscriptionStatus.ACTIVE,
          userId: 'user_1',
        },
      });
      expect(result).toBe(created);
    });

    it('logs and rethrows when Prisma fails', async () => {
      delegate.create.mockRejectedValue(new Error('unique violation'));

      await expect(service.create({ userId: 'user_1' })).rejects.toThrowError(
        'unique violation',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('findByUser', () => {
    it('returns the live subscription for the user', async () => {
      const row = buildSubscription();
      delegate.findUnique.mockResolvedValue(row);

      await expect(service.findByUser('user_1')).resolves.toBe(row);
      expect(delegate.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user_1' },
      });
    });

    it('treats a soft-deleted row as missing', async () => {
      delegate.findUnique.mockResolvedValue(
        buildSubscription({ isDeleted: true }),
      );

      await expect(service.findByUser('user_1')).resolves.toBeNull();
    });

    it('returns null when no row exists', async () => {
      delegate.findUnique.mockResolvedValue(null);

      await expect(service.findByUser('user_1')).resolves.toBeNull();
    });
  });

  describe('getOrCreateSubscription', () => {
    it('returns the existing subscription without creating a second one', async () => {
      const row = buildSubscription();
      delegate.findUnique.mockResolvedValue(row);

      await expect(service.getOrCreateSubscription('user_1')).resolves.toBe(
        row,
      );
      expect(delegate.create).not.toHaveBeenCalled();
    });

    it('creates an ACTIVE subscription when none exists', async () => {
      delegate.findUnique.mockResolvedValue(null);
      const created = buildSubscription({ id: 'usub_new' });
      delegate.create.mockResolvedValue(created);

      const result = await service.getOrCreateSubscription('user_1');

      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          cancelAtPeriodEnd: false,
          isDeleted: false,
          status: SubscriptionStatus.ACTIVE,
          userId: 'user_1',
        },
      });
      expect(result).toBe(created);
    });

    it('recreates when the only row is soft-deleted', async () => {
      delegate.findUnique.mockResolvedValue(
        buildSubscription({ isDeleted: true }),
      );
      delegate.create.mockResolvedValue(buildSubscription({ id: 'usub_new' }));

      const result = await service.getOrCreateSubscription('user_1');

      expect(delegate.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('usub_new');
    });
  });

  describe('updateFromStripeSession', () => {
    it('stores the Stripe subscription id from the checkout session', async () => {
      delegate.findUnique.mockResolvedValue(buildSubscription());
      const updated = buildSubscription({ stripeSubscriptionId: 'sub_live' });
      delegate.update.mockResolvedValue(updated);

      const session = {
        subscription: 'sub_live',
      } as unknown as CheckoutSession;

      const result = await service.updateFromStripeSession('user_1', session);

      expect(delegate.update).toHaveBeenCalledWith({
        data: { stripeSubscriptionId: 'sub_live' },
        where: { id: 'usub_1' },
      });
      expect(result).toBe(updated);
    });

    it('writes an empty patch when the session carries no subscription', async () => {
      delegate.findUnique.mockResolvedValue(buildSubscription());
      delegate.update.mockResolvedValue(buildSubscription());

      const session = { subscription: null } as unknown as CheckoutSession;

      await service.updateFromStripeSession('user_1', session);

      expect(delegate.update).toHaveBeenCalledWith({
        data: {},
        where: { id: 'usub_1' },
      });
    });

    it('warns and returns null when the user has no subscription', async () => {
      delegate.findUnique.mockResolvedValue(null);

      const session = {
        subscription: 'sub_live',
      } as unknown as CheckoutSession;

      await expect(
        service.updateFromStripeSession('user_1', session),
      ).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalled();
      expect(delegate.update).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('writes the SCREAMING_SNAKE Prisma status label', async () => {
      delegate.findUnique.mockResolvedValue(buildSubscription());
      delegate.update.mockResolvedValue(
        buildSubscription({ status: SubscriptionStatus.PAST_DUE }),
      );

      await service.updateStatus('user_1', SubscriptionStatus.PAST_DUE);

      expect(delegate.update).toHaveBeenCalledWith({
        data: { status: 'PAST_DUE' },
        where: { id: 'usub_1' },
      });
    });

    it('includes period end and cancel-at-period-end when supplied', async () => {
      const periodEnd = new Date('2026-09-01T00:00:00.000Z');
      delegate.findUnique.mockResolvedValue(buildSubscription());
      delegate.update.mockResolvedValue(buildSubscription());

      await service.updateStatus(
        'user_1',
        SubscriptionStatus.CANCELLED,
        periodEnd,
        true,
      );

      expect(delegate.update).toHaveBeenCalledWith({
        data: {
          cancelAtPeriodEnd: true,
          currentPeriodEnd: periodEnd,
          status: SubscriptionStatus.CANCELLED,
        },
        where: { id: 'usub_1' },
      });
    });

    it('keeps a falsy cancelAtPeriodEnd=false in the patch', async () => {
      delegate.findUnique.mockResolvedValue(buildSubscription());
      delegate.update.mockResolvedValue(buildSubscription());

      await service.updateStatus(
        'user_1',
        SubscriptionStatus.ACTIVE,
        undefined,
        false,
      );

      expect(delegate.update).toHaveBeenCalledWith({
        data: {
          cancelAtPeriodEnd: false,
          status: SubscriptionStatus.ACTIVE,
        },
        where: { id: 'usub_1' },
      });
    });

    it('returns null when the user has no subscription', async () => {
      delegate.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('user_1', SubscriptionStatus.ACTIVE),
      ).resolves.toBeNull();
      expect(delegate.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('soft-deletes via isDeleted rather than removing the row', async () => {
      delegate.update.mockResolvedValue(buildSubscription({ isDeleted: true }));

      await service.delete('usub_1');

      expect(delegate.update).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: { id: 'usub_1' },
      });
    });

    it('logs and rethrows when the soft delete fails', async () => {
      delegate.update.mockRejectedValue(new Error('row locked'));

      await expect(service.delete('usub_1')).rejects.toThrowError('row locked');
      expect(logger.error).toHaveBeenCalledWith(
        'UserSubscriptionsService delete failed',
        expect.objectContaining({ id: 'usub_1' }),
      );
    });
  });
});
