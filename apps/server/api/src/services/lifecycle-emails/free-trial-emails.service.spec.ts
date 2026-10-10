import type { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import * as deployment from '@genfeedai/config';
import type { ConfigService } from '@libs/config/config.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FreeTrialEmailsService } from './free-trial-emails.service';

const CREATED_AT = new Date('2026-10-01T09:00:00.000Z');
const HOUR_MS = 3_600_000;
const at = (hours: number) => new Date(CREATED_AT.getTime() + hours * HOUR_MS);

function trialSubject(overrides: { subscriptions?: unknown[] } = {}) {
  return {
    billingAccount: null,
    createdAt: CREATED_AT,
    creditTransactions: [],
    isProactiveOnboarding: false,
    subscriptions: overrides.subscriptions ?? [],
    user: { userSubscription: null },
    warmupAccounts: [],
  };
}

describe('FreeTrialEmailsService', () => {
  let subject: ReturnType<typeof trialSubject>;
  // A rollout long past unless a case sets it, so windows run from creation.
  let rolloutAt = '2026-01-01T00:00:00.000Z';
  const organizationFindFirst = vi.fn(
    async (args: { select: Record<string, unknown> }) =>
      'slug' in args.select
        ? {
            billingAccount: { members: [{ userId: 'billing-owner' }] },
            slug: 'acme studio',
            userId: 'org-owner',
          }
        : subject,
  );
  const emailMessageFindFirst = vi.fn();
  const queueEmail = vi.fn();
  const service = new FreeTrialEmailsService(
    {
      emailMessage: { findFirst: emailMessageFindFirst },
      organization: { findFirst: organizationFindFirst },
    } as unknown as PrismaService,
    {
      get: (key: string) =>
        key === 'FREE_TRIAL_ROLLOUT_AT' ? rolloutAt : 'https://app.genfeed.ai/',
    } as unknown as ConfigService,
    { queueEmail } as unknown as EmailPerformanceService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(deployment, 'usesMeteredCredits').mockReturnValue(true);
    vi.spyOn(deployment, 'isSelfHostedDeployment').mockReturnValue(false);
    subject = trialSubject();
    rolloutAt = '2026-01-01T00:00:00.000Z';
    emailMessageFindFirst.mockResolvedValue(null);
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    [47, null],
    [48, 'trial-ending'],
    [71.9, 'trial-ending'],
    [72, 'trial-ended'],
    [95.9, 'trial-ended'],
    [96, null],
    [500, null],
  ])('at %sh after creation sends %s', async (hours, expected) => {
    await expect(service.sendDueTrialNotices('org-1', at(hours))).resolves.toBe(
      expected,
    );
    expect(queueEmail).toHaveBeenCalledTimes(expected ? 1 : 0);
  });

  it.each([
    ['2026-10-12T00:00:00.000Z', null],
    ['2026-10-13T02:00:00.000Z', 'trial-ending'],
    ['2026-10-14T01:00:00.000Z', 'trial-ended'],
    ['2026-10-15T01:00:00.000Z', null],
  ])(
    'gives a legacy organization its notices from the rollout (%s → %s)',
    async (now, expected) => {
      rolloutAt = '2026-10-11T00:00:00.000Z';
      subject = {
        ...trialSubject(),
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      };

      await expect(
        service.sendDueTrialNotices('org-1', new Date(now)),
      ).resolves.toBe(expected);
    },
  );

  it('never nudges an organization an operator comped', async () => {
    subject = {
      ...trialSubject(),
      creditTransactions: [{ id: 'comp' }],
    };

    await expect(
      service.sendDueTrialNotices('org-1', at(50)),
    ).resolves.toBeNull();
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('queues "ends in 24 hours" to the billing owner with a plans CTA', async () => {
    await service.sendDueTrialNotices('org-1', at(50));

    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationUrl:
          'https://app.genfeed.ai/acme%20studio/~/settings/subscription',
        goal: 'buy_credits',
        idempotencyKey: 'product:org-1:free-trial:trial-ending',
        organizationId: 'org-1',
        subject: 'Your free trial ends in 24 hours',
        templateKey: 'trial-ending',
        topic: 'lifecycle.onboarding',
        userId: 'billing-owner',
      }),
    );
    const [{ html }] = queueEmail.mock.calls[0];
    expect(html).toContain('href="{{emailActionUrl}}"');
    expect(html).toContain(
      'https://app.genfeed.ai/acme%20studio/~/settings/credits',
    );
  });

  it('queues each notice once per organization', async () => {
    emailMessageFindFirst.mockResolvedValue({ id: 'already-sent' });

    await expect(
      service.sendDueTrialNotices('org-1', at(73)),
    ).resolves.toBeNull();
    expect(queueEmail).not.toHaveBeenCalled();
    expect(emailMessageFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        isDeleted: false,
        organizationId: 'org-1',
        templateKey: 'trial-ended',
      },
    });
  });

  it('never nudges an organization that paid', async () => {
    subject = trialSubject({ subscriptions: [{ id: 'sub' }] });

    await expect(
      service.sendDueTrialNotices('org-1', at(50)),
    ).resolves.toBeNull();
    await expect(service.sendTrialCreditsLow('org-1', at(10))).resolves.toBe(
      false,
    );
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('sends nothing on a self-hosted deployment', async () => {
    vi.mocked(deployment.isSelfHostedDeployment).mockReturnValue(true);

    await expect(
      service.sendDueTrialNotices('org-1', at(50)),
    ).resolves.toBeNull();
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('sends "running low" during the trial with a credits CTA', async () => {
    await expect(service.sendTrialCreditsLow('org-1', at(10))).resolves.toBe(
      true,
    );

    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationUrl:
          'https://app.genfeed.ai/acme%20studio/~/settings/credits',
        idempotencyKey: 'product:org-1:free-trial:trial-credits-low',
        subject: "You're running low on credits",
        templateKey: 'trial-credits-low',
        topic: 'billing.credits',
      }),
    );
  });

  it('does not send "running low" once the trial has ended', async () => {
    await expect(service.sendTrialCreditsLow('org-1', at(80))).resolves.toBe(
      false,
    );
    expect(queueEmail).not.toHaveBeenCalled();
  });
});
