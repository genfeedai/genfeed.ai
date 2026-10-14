import { creditUsageWhere } from '@api/collections/credits/services/credit-usage.util';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import type { LowCreditThresholdService } from '@api/services/low-credit-threshold/low-credit-threshold.service';
import type { NotificationPreferenceService } from '@api/services/notifications/workflow-notifications/notification-preference.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it, vi } from 'vitest';
import type { FreeTrialEmailsService } from './free-trial-emails.service';
import { LifecycleEmailMaintenanceService } from './lifecycle-email-maintenance.service';
import type { LifecycleEmailWorkService } from './lifecycle-email-work.service';
import type { LifecycleEmailWorkflowService } from './lifecycle-email-workflow.service';
import type { SystemEmailEligibilityService } from './system-email-eligibility.service';

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isSelfHostedDeployment: vi.fn(() => false),
}));

const sendDueTrialNotices = vi.fn().mockResolvedValue(null);
// A paying organization whose latest grant makes 500 credits "low".
const resolveLowCredit = vi
  .fn()
  .mockResolvedValue({ isTrialSubject: false, threshold: 500 });

const request = {
  organizationId: 'org-1',
  referenceDate: '2026-09-14T08:00:00.000Z',
};
function fixture(count: number, isConnected = true) {
  const queueEmail = vi.fn();
  const findForUser = vi.fn().mockResolvedValue({ isEnabled: true });
  const prisma = {
    brand: { findFirst: vi.fn().mockResolvedValue({ slug: 'brand' }) },
    organization: { findFirst: vi.fn().mockResolvedValue({ slug: 'studio' }) },
    member: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'member-1', userId: 'user-1' }]),
    },
    ingredient: {
      findMany: vi.fn().mockResolvedValue(
        Array.from({ length: count }, (_, index) => ({
          id: `asset-${index}`,
          brandId: 'brand-1',
        })),
      ),
    },
    article: { findMany: vi.fn().mockResolvedValue([]) },
    post: { findMany: vi.fn().mockResolvedValue([]) },
    creditTransaction: {
      groupBy: vi.fn(({ where }: { where: { amount: { lt?: number } } }) =>
        Promise.resolve(
          where.amount.lt === 0
            ? []
            : [{ _sum: { amount: 450 }, category: 'deduct' }],
        ),
      ),
    },
  };
  const service = new LifecycleEmailMaintenanceService(
    prisma as unknown as PrismaService,
    {
      get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
    } as unknown as ConfigService,
    {} as SystemWorkflowRunnerService,
    {} as LifecycleEmailWorkflowService,
    { queueEmail } as unknown as EmailPerformanceService,
    {
      hasConnection: vi.fn().mockResolvedValue(isConnected),
    } as unknown as SystemEmailEligibilityService,
    { findForUser } as unknown as NotificationPreferenceService,
    {} as WorkflowExecutionQueueService,
    { sendDueTrialNotices } as unknown as FreeTrialEmailsService,
    { resolve: resolveLowCredit } as unknown as LowCreditThresholdService,
    {} as LifecycleEmailWorkService,
  );
  return { service, prisma, queueEmail, findForUser };
}

describe('system recap policy', () => {
  it('prepares recaps on the hourly run whatever its minute', async () => {
    const { service, queueEmail } = fixture(1);
    await service.recaps({
      organizationId: 'org-1',
      referenceDate: '2026-09-14T08:20:00.000Z',
    });
    expect(queueEmail.mock.calls.map(([input]) => input.topic)).toEqual([
      'content.daily',
    ]);
  });
  it('does not queue a weekly recap for four outputs', async () => {
    const { service, queueEmail } = fixture(4);
    await service.recaps(request);
    expect(queueEmail.mock.calls.map(([input]) => input.topic)).toEqual([
      'content.daily',
    ]);
  });
  it('queues a tracked weekly recap at five outputs using completion time and tenant/user scope', async () => {
    const { service, prisma, queueEmail } = fixture(5);
    await service.recaps(request);
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          isDeleted: false,
          parentId: null,
          generationCompletedAt: {
            gte: new Date('2026-09-07T00:00:00Z'),
            lt: new Date('2026-09-14T00:00:00Z'),
          },
        }),
      }),
    );
    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'content.weekly',
        userId: 'user-1',
        organizationId: 'org-1',
        html: expect.stringContaining('{{emailActionUrl}}'),
        idempotencyKey: 'product:org-1:week:user-1:2026-09-07T00:00:00.000Z',
      }),
    );
    expect(queueEmail.mock.calls[0][0].html).toContain(
      'analytics are available',
    );
  });
  it.each([
    [false, 'settings/connected-accounts', 'connect_account'],
    [true, 'studio/playground', 'publish_content'],
  ] as const)(
    'links the recap to the canonical next step when connected=%s',
    async (isConnected, route, goal) => {
      const { service, prisma, queueEmail } = fixture(5, isConnected);
      await service.recaps(request);
      expect(queueEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationUrl: `https://app.genfeed.ai/studio/brand/${route}`,
          goal,
        }),
      );
      expect(prisma.brand.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', isDeleted: false, id: 'brand-1' },
        }),
      );
    },
  );
  it('reports credit usage net of refunds, by row magnitude, without referral reward reversals', async () => {
    const { service, prisma, queueEmail } = fixture(5);
    prisma.creditTransaction.groupBy.mockImplementation(({ where }) =>
      Promise.resolve(
        where.amount.lt === 0
          ? // Legacy negative-signed deduction counts its magnitude.
            [{ _sum: { amount: -100 }, category: 'deduct' }]
          : [
              { _sum: { amount: 450 }, category: 'deduct' },
              { _sum: { amount: 50 }, category: 'refund' },
            ],
      ),
    );
    await service.recaps(request);
    expect(prisma.creditTransaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['category'],
        where: expect.objectContaining({
          ...creditUsageWhere(),
          actorUserId: 'user-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(queueEmail.mock.calls[0][0].html).toContain(
      '500 credits used during this period.',
    );
  });
  it('deduplicates repeated generated IDs before the five-piece threshold', async () => {
    const { service, prisma, queueEmail } = fixture(5);
    prisma.ingredient.findMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({
        id: 'same-asset',
        brandId: 'brand-1',
      })),
    );
    await service.recaps(request);
    expect(queueEmail.mock.calls.map(([input]) => input.topic)).toEqual([
      'content.daily',
    ]);
  });
  it('does not prepare or queue recaps when both recap preferences are disabled', async () => {
    const { service, prisma, queueEmail, findForUser } = fixture(5);
    findForUser.mockResolvedValue({ isEnabled: false });
    await service.recaps(request);
    expect(queueEmail).not.toHaveBeenCalled();
    expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
  });
  it('counts generated articles for an article-only creator', async () => {
    const { service, prisma, queueEmail } = fixture(0);
    prisma.article.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `article-${index}`,
        brandId: 'brand-1',
        label: `Article ${index}`,
      })),
    );
    await service.recaps(request);
    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'content.weekly',
        html: expect.stringContaining('Article 0'),
      }),
    );
    expect(queueEmail.mock.calls.map(([input]) => input.topic)).toEqual([
      'content.weekly',
    ]);
  });
});

function creditsFixture(overrides: {
  spendable: number;
  recentAlert?: { templateKey: string } | null;
  hasPaidGrant?: boolean;
}) {
  const queueEmail = vi.fn();
  const prisma = {
    creditBalance: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ balance: overrides.spendable, heldAmount: 0 }),
    },
    organization: {
      findFirst: vi.fn().mockResolvedValue({
        slug: 'studio',
        userId: 'owner-1',
        billingAccount: { members: [] },
      }),
    },
    creditTransaction: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.hasPaidGrant === false ? null : { id: 'grant-1' },
        ),
    },
    emailMessage: {
      findFirst: vi.fn().mockResolvedValue(overrides.recentAlert ?? null),
    },
  };
  const service = new LifecycleEmailMaintenanceService(
    prisma as unknown as PrismaService,
    {
      get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
    } as unknown as ConfigService,
    {} as SystemWorkflowRunnerService,
    {} as LifecycleEmailWorkflowService,
    { queueEmail } as unknown as EmailPerformanceService,
    {} as SystemEmailEligibilityService,
    {
      findForUser: vi.fn().mockResolvedValue({ isEnabled: true }),
    } as unknown as NotificationPreferenceService,
    {} as WorkflowExecutionQueueService,
    { sendDueTrialNotices } as unknown as FreeTrialEmailsService,
    { resolve: resolveLowCredit } as unknown as LowCreditThresholdService,
    {} as LifecycleEmailWorkService,
  );
  return { service, prisma, queueEmail };
}

describe('credit balance alerts', () => {
  it('alerts once when the balance first drops below the threshold', async () => {
    const { service, queueEmail } = creditsFixture({ spendable: 400 });
    await service.credits(request);
    expect(resolveLowCredit).toHaveBeenCalledWith('org-1');
    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'billing.credits',
        templateKey: 'credit-low',
        userId: 'owner-1',
        policyData: { lowCreditThreshold: 500 },
      }),
    );
  });
  it('does not call a balance above the relative threshold low', async () => {
    // 600 spendable used to be "low" against a fixed 1000.
    const { service, queueEmail } = creditsFixture({ spendable: 600 });
    await service.credits(request);
    expect(queueEmail).not.toHaveBeenCalled();
  });
  it('sends no low alert when no threshold is known, but still the exhausted one', async () => {
    resolveLowCredit.mockResolvedValueOnce({
      isTrialSubject: false,
      threshold: null,
    });
    const low = creditsFixture({ spendable: 10 });
    await low.service.credits(request);
    expect(low.queueEmail).not.toHaveBeenCalled();

    resolveLowCredit.mockClear();
    const empty = creditsFixture({ spendable: 0 });
    await empty.service.credits(request);
    expect(resolveLowCredit).not.toHaveBeenCalled();
    expect(empty.queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'credit-exhausted' }),
    );
  });
  it('does not repeat the same tier while the balance simply stays low', async () => {
    const { service, prisma, queueEmail } = creditsFixture({
      spendable: 400,
      recentAlert: { templateKey: 'credit-low' },
    });
    await service.credits(request);
    expect(queueEmail).not.toHaveBeenCalled();
    // One lookup across both tiers, over a window wider than a day.
    const [call] = prisma.emailMessage.findFirst.mock.calls;
    expect(call[0].where.templateKey).toEqual({
      in: ['credit-low', 'credit-exhausted'],
    });
    expect(call[0].where.createdAt.gt).toEqual(
      new Date('2026-09-07T08:00:00.000Z'),
    );
  });
  it('escalates from low to exhausted inside the cooldown', async () => {
    const { service, queueEmail } = creditsFixture({
      spendable: 0,
      recentAlert: { templateKey: 'credit-low' },
    });
    await service.credits(request);
    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'credit-exhausted' }),
    );
  });
  it('does not fall back to a low alert after an exhausted alert', async () => {
    const { service, queueEmail } = creditsFixture({
      spendable: 400,
      recentAlert: { templateKey: 'credit-exhausted' },
    });
    await service.credits(request);
    expect(queueEmail).not.toHaveBeenCalled();
  });
  it('does not alert an organization that has never paid for credits', async () => {
    const { service, prisma, queueEmail } = creditsFixture({
      spendable: 0,
      hasPaidGrant: false,
    });
    await service.credits(request);
    expect(queueEmail).not.toHaveBeenCalled();
    expect(prisma.emailMessage.findFirst).not.toHaveBeenCalled();
    expect(prisma.creditTransaction.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        isDeleted: false,
        amount: { gt: 0 },
        referenceId: { not: null },
        referenceType: { startsWith: 'stripe-' },
      },
      select: { id: true },
    });
  });
  it('evaluates balances on the hourly run whatever its minute', async () => {
    const { service, queueEmail } = creditsFixture({ spendable: 400 });
    sendDueTrialNotices.mockClear();
    await service.credits({
      organizationId: 'org-1',
      referenceDate: '2026-09-14T08:20:00.000Z',
    });
    expect(sendDueTrialNotices).toHaveBeenCalledOnce();
    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'credit-low' }),
    );
  });
  it('evaluates the free-trial notices at the reference time', async () => {
    const { service } = creditsFixture({ spendable: 400 });
    sendDueTrialNotices.mockClear();
    await service.credits(request);
    expect(sendDueTrialNotices).toHaveBeenCalledWith(
      'org-1',
      new Date(request.referenceDate),
    );
  });
});

describe('hourly system email sweep', () => {
  function sweepFixture(organizationIds: string[]) {
    const registered = new Map<
      string,
      (context: unknown) => Promise<unknown>
    >();
    const queueSystemWorkflow = vi.fn().mockResolvedValue(undefined);
    const findOrganizationIds = vi.fn().mockResolvedValue(organizationIds);
    const findMany = vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(
        where.id.in.map((id) => ({ id, userId: `owner-of-${id}` })),
      ),
    );
    const service = new LifecycleEmailMaintenanceService(
      { organization: { findMany } } as unknown as PrismaService,
      {} as ConfigService,
      {
        registerAction: (
          id: string,
          handler: (context: unknown) => Promise<unknown>,
        ) => registered.set(id, handler),
        registerWorkflow: vi.fn(),
      } as unknown as SystemWorkflowRunnerService,
      {} as LifecycleEmailWorkflowService,
      {} as EmailPerformanceService,
      {} as SystemEmailEligibilityService,
      {} as NotificationPreferenceService,
      { queueSystemWorkflow } as unknown as WorkflowExecutionQueueService,
      {} as FreeTrialEmailsService,
      {} as LowCreditThresholdService,
      { findOrganizationIds } as unknown as LifecycleEmailWorkService,
    );
    service.onModuleInit();
    const discover = registered.get('lifecycle-email.sweep.discover');
    if (!discover) throw new Error('discover action not registered');
    return { discover, findMany, findOrganizationIds, queueSystemWorkflow };
  }

  it('queues one run per organization with work, and none for idle ones', async () => {
    const { discover, findOrganizationIds, queueSystemWorkflow } = sweepFixture(
      ['org-a', 'org-b'],
    );
    await expect(
      discover({
        input: { request: { referenceDate: request.referenceDate } },
      }),
    ).resolves.toEqual({ count: 2 });
    expect(findOrganizationIds).toHaveBeenCalledWith(
      new Date(request.referenceDate),
    );
    expect(
      queueSystemWorkflow.mock.calls.map(([input]) => input.organizationId),
    ).toEqual(['org-a', 'org-b']);
    expect(queueSystemWorkflow.mock.calls[0]).toEqual([
      expect.objectContaining({
        canonicalId: 'lifecycle-email.organization',
        userId: 'owner-of-org-a',
        inputValues: {
          request: {
            organizationId: 'org-a',
            referenceDate: request.referenceDate,
          },
        },
      }),
      // One job per organization per UTC hour.
      `system-email-org-a-${Math.floor(new Date(request.referenceDate).getTime() / 3_600_000)}`,
      expect.objectContaining({ attempts: 3 }),
    ]);
  });

  it('queues nothing when no organization has work', async () => {
    const { discover, findMany, queueSystemWorkflow } = sweepFixture([]);
    await expect(
      discover({
        input: { request: { referenceDate: request.referenceDate } },
      }),
    ).resolves.toEqual({ count: 0 });
    expect(findMany).not.toHaveBeenCalled();
    expect(queueSystemWorkflow).not.toHaveBeenCalled();
  });
});
