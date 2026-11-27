import {
  assertPublishIntentAdmission,
  assertPublishingPaymentAdmission,
} from '@api/collections/posts/services/post-publishing-payment-admission.util';
import * as deployment from '@genfeedai/config';
import { TargetExecutionState } from '@genfeedai/contracts';
import { HttpException, HttpStatus } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type OrganizationRow = {
  billingAccount: null;
  createdAt: Date;
  creditTransactions: Array<{ id: string }>;
  isProactiveOnboarding: boolean;
  subscriptions: Array<{ id: string }>;
  user: { userSubscription: null };
  warmupAccounts: Array<{ id: string }>;
};

function neverPaid(overrides: Partial<OrganizationRow> = {}): OrganizationRow {
  return {
    billingAccount: null,
    createdAt: new Date('2026-11-27T10:00:00.000Z'),
    creditTransactions: [],
    isProactiveOnboarding: false,
    subscriptions: [],
    user: { userSubscription: null },
    warmupAccounts: [],
    ...overrides,
  };
}

/** An organization table holding one row, as the admission reads it. */
function clientWith(row: OrganizationRow | null) {
  return {
    organization: { findFirst: vi.fn().mockResolvedValue(row) },
  } as unknown as Parameters<typeof assertPublishingPaymentAdmission>[0];
}

async function admit(
  row: OrganizationRow | null,
  candidate: Record<string, unknown>,
): Promise<unknown> {
  return assertPublishingPaymentAdmission(clientWith(row), {
    organizationId: 'org-1',
    ...candidate,
  }).then(
    () => 'admitted',
    (error: unknown) => error,
  );
}

describe('assertPublishingPaymentAdmission', () => {
  beforeEach(() => {
    vi.spyOn(deployment, 'usesMeteredCredits').mockReturnValue(true);
    vi.spyOn(deployment, 'isSelfHostedDeployment').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([TargetExecutionState.SCHEDULED, TargetExecutionState.PUBLISHING])(
    'refuses a never-paid organization moving a post to %s with 402',
    async (targetExecutionState) => {
      const result = await admit(neverPaid(), { targetExecutionState });

      expect(result).toBeInstanceOf(HttpException);
      expect((result as HttpException).getStatus()).toBe(
        HttpStatus.PAYMENT_REQUIRED,
      );
      expect((result as HttpException).getResponse()).toMatchObject({
        code: 'publishing_payment_required',
      });
    },
  );

  it('keeps drafts open to a never-paid organization', async () => {
    expect(
      await admit(neverPaid(), {
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    ).toBe('admitted');
  });

  it('lets thread children follow their root', async () => {
    expect(
      await admit(neverPaid(), {
        parentId: 'root-post',
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ).toBe('admitted');
  });

  it.each([
    ['a paid subscription', { subscriptions: [{ id: 'sub-1' }] }],
    ['a paid credit pack', { creditTransactions: [{ id: 'grant-1' }] }],
    ['a warm-up workspace', { warmupAccounts: [{ id: 'warmup-1' }] }],
    ['proactive onboarding', { isProactiveOnboarding: true }],
  ])('schedules for an organization with %s', async (_label, overrides) => {
    expect(
      await admit(neverPaid(overrides), {
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ).toBe('admitted');
  });

  it('leaves a self-hosted deployment unmetered', async () => {
    vi.mocked(deployment.isSelfHostedDeployment).mockReturnValue(true);

    expect(
      await admit(neverPaid(), {
        targetExecutionState: TargetExecutionState.PUBLISHING,
      }),
    ).toBe('admitted');
  });

  describe('on a lifecycle transition', () => {
    const transition = (currentState: TargetExecutionState) =>
      assertPublishIntentAdmission(
        clientWith(neverPaid()) as never,
        currentState,
        {
          organizationId: 'org-1',
          targetExecutionState: TargetExecutionState.PUBLISHING,
        },
      ).then(
        () => 'admitted',
        (error: unknown) => error,
      );

    it('refuses a draft a never-paid organization tries to publish', async () => {
      expect(await transition(TargetExecutionState.DRAFT)).toBeInstanceOf(
        HttpException,
      );
    });

    it('lets a target already scheduled move on, for the worker to refuse', async () => {
      expect(await transition(TargetExecutionState.SCHEDULED)).toBe('admitted');
    });
  });
});
