import { postExecutionStateReadFilter } from '@genfeedai/api-types';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { SubscriptionStatus, TargetExecutionState } from '@genfeedai/enums';
import type { LifecycleEmailJobData } from '@genfeedai/queue-contracts';
import type {
  ServerConfig,
  ServerLogger,
  ServerNotifications,
  ServerPrisma,
} from '@server/server.dependencies';
import { LifecycleEmailDeliveryService } from './lifecycle-email-delivery.service';

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isSelfHostedDeployment: vi.fn(() => false),
}));

const isSelfHostedMock = vi.mocked(isSelfHostedDeployment);

function makeJob(
  overrides: Partial<LifecycleEmailJobData> = {},
): LifecycleEmailJobData {
  return {
    sequence: 'welcome',
    step: 'welcome-day-0',
    triggerKey: 'trigger-1',
    userId: 'user-1',
    ...overrides,
  } as LifecycleEmailJobData;
}

function makeDelivery(overrides: Record<string, unknown> = {}) {
  return {
    email: 'user@test.dev',
    id: 'delivery-1',
    metadata: null,
    scheduledFor: new Date('2026-08-01T00:00:00.000Z'),
    sequence: 'welcome',
    status: 'pending',
    step: 'welcome-day-0',
    triggerKey: 'trigger-1',
    user: {
      email: 'user@test.dev',
      firstName: 'Ada',
      id: 'user-1',
      isDeleted: false,
    },
    ...overrides,
  };
}

describe('LifecycleEmailDeliveryService', () => {
  const deliveryFindFirst = vi.fn();
  const deliveryUpdate = vi.fn();
  const preferenceFindUnique = vi.fn();
  const preferenceCreate = vi.fn();
  const preferenceUpdate = vi.fn();
  const postFindFirst = vi.fn();
  const subscriptionFindFirst = vi.fn();
  const userSubscriptionFindFirst = vi.fn();
  const sendEmail = vi.fn();

  const notifications = { sendEmail } satisfies ServerNotifications;

  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;

  const configValues = new Map<string, string>();
  const config: ServerConfig = { get: (key) => configValues.get(key) };

  const prisma = {
    lifecycleEmailDelivery: {
      findFirst: deliveryFindFirst,
      update: deliveryUpdate,
    },
    lifecycleEmailPreference: {
      create: preferenceCreate,
      findUnique: preferenceFindUnique,
      update: preferenceUpdate,
    },
    post: { findFirst: postFindFirst },
    subscription: { findFirst: subscriptionFindFirst },
    userSubscription: { findFirst: userSubscriptionFindFirst },
  } as unknown as ServerPrisma;

  let service: LifecycleEmailDeliveryService;

  beforeEach(() => {
    vi.clearAllMocks();
    configValues.clear();
    isSelfHostedMock.mockReturnValue(false);
    service = new LifecycleEmailDeliveryService(
      prisma,
      notifications,
      config,
      logger,
    );
    deliveryFindFirst.mockResolvedValue(makeDelivery());
    deliveryUpdate.mockResolvedValue({});
    preferenceFindUnique.mockResolvedValue({
      id: 'pref-1',
      marketingUnsubscribedAt: null,
      unsubscribeToken: 'token-abc',
    });
    preferenceCreate.mockResolvedValue({
      id: 'pref-1',
      marketingUnsubscribedAt: null,
      unsubscribeToken: 'token-new',
    });
    postFindFirst.mockResolvedValue(null);
    subscriptionFindFirst.mockResolvedValue(null);
    userSubscriptionFindFirst.mockResolvedValue(null);
    sendEmail.mockResolvedValue(undefined);
  });

  describe('unsubscribe', () => {
    it('returns false for a blank token without touching the database', async () => {
      await expect(service.unsubscribe('   ')).resolves.toBe(false);
      expect(preferenceFindUnique).not.toHaveBeenCalled();
    });

    it('returns false when the token matches no preference', async () => {
      preferenceFindUnique.mockResolvedValueOnce(null);

      await expect(service.unsubscribe('nope')).resolves.toBe(false);
      expect(preferenceUpdate).not.toHaveBeenCalled();
    });

    it('records the unsubscribe timestamp and trims the token', async () => {
      await expect(service.unsubscribe('  token-abc  ')).resolves.toBe(true);

      expect(preferenceFindUnique).toHaveBeenCalledWith({
        where: { unsubscribeToken: 'token-abc' },
      });
      expect(preferenceUpdate).toHaveBeenCalledWith({
        data: { marketingUnsubscribedAt: expect.any(Date) },
        where: { id: 'pref-1' },
      });
    });

    it('is idempotent for an already-unsubscribed preference', async () => {
      preferenceFindUnique.mockResolvedValueOnce({
        id: 'pref-1',
        marketingUnsubscribedAt: new Date(),
        unsubscribeToken: 'token-abc',
      });

      await expect(service.unsubscribe('token-abc')).resolves.toBe(true);
      expect(preferenceUpdate).not.toHaveBeenCalled();
    });
  });

  describe('sendLifecycleEmail', () => {
    it('warns and returns when no delivery record exists', async () => {
      deliveryFindFirst.mockResolvedValueOnce(null);

      await service.sendLifecycleEmail(makeJob());

      expect(logger.warn).toHaveBeenCalledWith(
        'Lifecycle email delivery record missing',
        expect.objectContaining({ userId: 'user-1' }),
      );
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('looks the delivery up by the full job identity', async () => {
      await service.sendLifecycleEmail(makeJob());

      expect(deliveryFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sequence: 'welcome',
            step: 'welcome-day-0',
            triggerKey: 'trigger-1',
            userId: 'user-1',
          },
        }),
      );
    });

    it('is a no-op for an already-sent delivery', async () => {
      deliveryFindFirst.mockResolvedValueOnce(makeDelivery({ status: 'sent' }));

      await service.sendLifecycleEmail(makeJob());

      expect(sendEmail).not.toHaveBeenCalled();
      expect(deliveryUpdate).not.toHaveBeenCalled();
    });

    it.each(['canceled', 'skipped'])(
      'is a no-op for a %s delivery',
      async (status) => {
        deliveryFindFirst.mockResolvedValueOnce(makeDelivery({ status }));

        await service.sendLifecycleEmail(makeJob());

        expect(sendEmail).not.toHaveBeenCalled();
        expect(deliveryUpdate).not.toHaveBeenCalled();
      },
    );

    it('skips delivery entirely on self-hosted deployments', async () => {
      isSelfHostedMock.mockReturnValue(true);

      await service.sendLifecycleEmail(makeJob());

      expect(sendEmail).not.toHaveBeenCalled();
      expect(deliveryUpdate).toHaveBeenCalledWith({
        data: {
          failureReason: 'self-hosted deployment',
          skippedAt: expect.any(Date),
          status: 'skipped',
        },
        where: { id: 'delivery-1' },
      });
    });

    it('skips when the recipient is soft-deleted', async () => {
      deliveryFindFirst.mockResolvedValueOnce(
        makeDelivery({
          user: {
            email: 'user@test.dev',
            firstName: 'Ada',
            id: 'user-1',
            isDeleted: true,
          },
        }),
      );

      await service.sendLifecycleEmail(makeJob());

      expect(sendEmail).not.toHaveBeenCalled();
      expect(deliveryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failureReason: 'recipient unavailable',
          }),
        }),
      );
    });

    it('skips when the recipient has no email address', async () => {
      deliveryFindFirst.mockResolvedValueOnce(
        makeDelivery({
          user: {
            email: null,
            firstName: null,
            id: 'user-1',
            isDeleted: false,
          },
        }),
      );

      await service.sendLifecycleEmail(makeJob());

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('skips when the recipient unsubscribed from marketing', async () => {
      preferenceFindUnique.mockResolvedValueOnce({
        id: 'pref-1',
        marketingUnsubscribedAt: new Date(),
        unsubscribeToken: 'token-abc',
      });

      await service.sendLifecycleEmail(makeJob());

      expect(sendEmail).not.toHaveBeenCalled();
      expect(deliveryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failureReason: 'marketing unsubscribed',
          }),
        }),
      );
    });

    it('skips an activation nudge once the user has published a post', async () => {
      postFindFirst.mockResolvedValueOnce({ id: 'post-1' });

      await service.sendLifecycleEmail(
        makeJob({ sequence: 'activation-nudge', step: 'activation-nudge' }),
      );

      expect(postFindFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          isDeleted: false,
          ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
          userId: 'user-1',
        },
      });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(deliveryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failureReason: 'already activated',
          }),
        }),
      );
    });

    it('still sends an activation nudge when nothing was published', async () => {
      await service.sendLifecycleEmail(
        makeJob({ sequence: 'activation-nudge', step: 'activation-nudge' }),
      );

      expect(sendEmail).toHaveBeenCalled();
    });

    it('skips a win-back when an organization subscription is active', async () => {
      subscriptionFindFirst.mockResolvedValueOnce({ id: 'sub-1' });

      await service.sendLifecycleEmail(
        makeJob({ sequence: 'win-back', step: 'win-back' }),
      );

      expect(subscriptionFindFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          isDeleted: false,
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
          userId: 'user-1',
        },
      });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('skips a win-back when a user subscription is active', async () => {
      userSubscriptionFindFirst.mockResolvedValueOnce({ id: 'usub-1' });

      await service.sendLifecycleEmail(
        makeJob({ sequence: 'win-back', step: 'win-back' }),
      );

      expect(sendEmail).not.toHaveBeenCalled();
      expect(deliveryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failureReason: 'subscription active',
          }),
        }),
      );
    });

    it('sends a win-back when no subscription is active', async () => {
      await service.sendLifecycleEmail(
        makeJob({ sequence: 'win-back', step: 'win-back' }),
      );

      expect(sendEmail).toHaveBeenCalled();
    });

    it('sends the templated email and marks the delivery sent', async () => {
      await service.sendLifecycleEmail(makeJob());

      const [email, subject, html] = sendEmail.mock.calls[0];
      expect(email).toBe('user@test.dev');
      expect(subject).toBeTruthy();
      expect(html).toContain('Hi Ada');

      expect(deliveryUpdate).toHaveBeenCalledWith({
        data: {
          failureReason: null,
          sentAt: expect.any(Date),
          status: 'sent',
        },
        where: { id: 'delivery-1' },
      });
    });

    it('greets anonymously when the user has no first name', async () => {
      deliveryFindFirst.mockResolvedValueOnce(
        makeDelivery({
          user: {
            email: 'user@test.dev',
            firstName: '   ',
            id: 'user-1',
            isDeleted: false,
          },
        }),
      );

      await service.sendLifecycleEmail(makeJob());

      expect(sendEmail.mock.calls[0][2]).toContain('Hi there');
    });

    it('falls back to a generic template for an unknown step', async () => {
      deliveryFindFirst.mockResolvedValueOnce(
        makeDelivery({ step: 'not-a-real-step' }),
      );

      await service.sendLifecycleEmail(makeJob({ step: 'not-a-real-step' }));

      const [, subject, html] = sendEmail.mock.calls[0];
      expect(subject).toBe('Open Genfeed');
      expect(html).toContain('there is an update waiting');
    });

    it('routes the checkout recovery action at the checkout url from metadata', async () => {
      deliveryFindFirst.mockResolvedValueOnce(
        makeDelivery({
          metadata: { checkoutUrl: 'https://checkout.test/session-1' },
          sequence: 'abandoned-checkout',
          step: 'checkout-recovery',
        }),
      );

      await service.sendLifecycleEmail(
        makeJob({ sequence: 'abandoned-checkout', step: 'checkout-recovery' }),
      );

      expect(sendEmail.mock.calls[0][2]).toContain(
        'https://checkout.test/session-1',
      );
    });

    it('ignores array metadata', async () => {
      deliveryFindFirst.mockResolvedValueOnce(
        makeDelivery({ metadata: ['not', 'an', 'object'] }),
      );

      await service.sendLifecycleEmail(makeJob());

      expect(sendEmail).toHaveBeenCalled();
    });

    it('ignores metadata fields of the wrong type', async () => {
      deliveryFindFirst.mockResolvedValueOnce(
        makeDelivery({
          metadata: {
            checkoutUrl: 42,
            organizationId: null,
            source: {},
            subscriptionId: 'sub-1',
          },
        }),
      );

      await service.sendLifecycleEmail(makeJob());

      expect(sendEmail).toHaveBeenCalled();
    });

    it('builds the unsubscribe link from the configured API url', async () => {
      configValues.set('GENFEEDAI_API_URL', 'https://api.test.dev/');

      await service.sendLifecycleEmail(makeJob());

      expect(sendEmail.mock.calls[0][2]).toContain(
        'https://api.test.dev/lifecycle-emails/unsubscribe?token=token-abc',
      );
    });

    it('uses the configured app url with trailing slashes stripped', async () => {
      configValues.set('GENFEEDAI_APP_URL', 'https://app.test.dev///');

      await service.sendLifecycleEmail(makeJob());

      const html = sendEmail.mock.calls[0][2];
      expect(html).toContain('https://app.test.dev/');
      expect(html).not.toContain('https://app.test.dev///');
    });

    it('drops the unsubscribe anchor when the API url has an unsafe scheme', async () => {
      configValues.set('GENFEEDAI_API_URL', 'javascript:alert(1)');

      await service.sendLifecycleEmail(makeJob());

      const html = sendEmail.mock.calls[0][2];
      expect(html).toContain('Reply to this email to unsubscribe.');
      expect(html).not.toContain('javascript:alert(1)');
    });

    it('creates a preference row when the user has none yet', async () => {
      preferenceFindUnique.mockResolvedValueOnce(null);

      await service.sendLifecycleEmail(makeJob());

      expect(preferenceCreate).toHaveBeenCalledWith({
        data: {
          unsubscribeToken: expect.any(String),
          userId: 'user-1',
        },
      });
      expect(sendEmail).toHaveBeenCalled();
    });

    it('re-reads the preference when a concurrent create wins the race', async () => {
      preferenceFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'pref-1',
        marketingUnsubscribedAt: null,
        unsubscribeToken: 'token-race',
      });
      preferenceCreate.mockRejectedValueOnce(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      );

      await service.sendLifecycleEmail(makeJob());

      expect(sendEmail.mock.calls[0][2]).toContain('token-race');
    });

    it('rethrows a non-unique preference create failure', async () => {
      preferenceFindUnique.mockResolvedValueOnce(null);
      preferenceCreate.mockRejectedValueOnce(new Error('db down'));

      await expect(service.sendLifecycleEmail(makeJob())).rejects.toThrow(
        'db down',
      );

      expect(deliveryUpdate).toHaveBeenCalledWith({
        data: { failureReason: 'db down', status: 'failed' },
        where: { id: 'delivery-1' },
      });
    });

    it('rethrows when the unique-conflict re-read finds nothing', async () => {
      preferenceFindUnique.mockResolvedValue(null);
      preferenceCreate.mockRejectedValueOnce(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      );

      await expect(service.sendLifecycleEmail(makeJob())).rejects.toThrow(
        'unique',
      );
    });

    it('marks the delivery failed and rethrows when sending throws', async () => {
      sendEmail.mockRejectedValueOnce(new Error('smtp down'));

      await expect(service.sendLifecycleEmail(makeJob())).rejects.toThrow(
        'smtp down',
      );

      expect(deliveryUpdate).toHaveBeenCalledWith({
        data: { failureReason: 'smtp down', status: 'failed' },
        where: { id: 'delivery-1' },
      });
    });

    it('stringifies a non-Error failure reason', async () => {
      sendEmail.mockRejectedValueOnce('plain string boom');

      await expect(service.sendLifecycleEmail(makeJob())).rejects.toBe(
        'plain string boom',
      );

      expect(deliveryUpdate).toHaveBeenCalledWith({
        data: { failureReason: 'plain string boom', status: 'failed' },
        where: { id: 'delivery-1' },
      });
    });
  });
});
