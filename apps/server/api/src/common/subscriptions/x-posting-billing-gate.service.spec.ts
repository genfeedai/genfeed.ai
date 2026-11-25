import { XPostingBillingGate } from '@api/common/subscriptions/x-posting-billing-gate.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const APP_URL = 'https://app.genfeed.ai';

function build(options: { hasCredits?: boolean; isFreePlan?: boolean } = {}) {
  const paidAccess = {
    isSubscriptionGatedFresh: vi
      .fn()
      .mockResolvedValue(options.isFreePlan ?? false),
  };
  const credits = {
    checkOrganizationCreditsAvailable: vi
      .fn()
      .mockResolvedValue(options.hasCredits ?? true),
  };
  return {
    credits,
    gate: new XPostingBillingGate(paidAccess as never, credits as never),
    paidAccess,
  };
}

const X_POST = {
  appUrl: APP_URL,
  includeCredits: true,
  organizationId: 'org-1',
  platform: CredentialPlatform.TWITTER,
  text: 'Launch note',
};

describe('XPostingBillingGate', () => {
  it('lets every other platform through without reading the plan', async () => {
    const { gate, paidAccess } = build({ isFreePlan: true });

    await expect(
      gate.check({ ...X_POST, platform: CredentialPlatform.INSTAGRAM }),
    ).resolves.toBeNull();
    expect(paidAccess.isSubscriptionGatedFresh).not.toHaveBeenCalled();
  });

  it('tells the free plan why, and where to choose a plan', async () => {
    const { gate } = build({ isFreePlan: true });

    await expect(gate.check(X_POST)).resolves.toEqual({
      code: 'x_posting_requires_paid_plan',
      message:
        'Posting to X needs a paid plan. Choose a plan to publish to X: https://app.genfeed.ai/settings/subscription',
      upgradeUrl: 'https://app.genfeed.ai/settings/subscription',
    });
  });

  it('tells a paid plan with an empty wallet what the post costs and where to buy credits', async () => {
    const { credits, gate } = build({ hasCredits: false });

    await expect(
      gate.check({ ...X_POST, text: 'New drop https://genfeed.ai/drop' }),
    ).resolves.toMatchObject({
      code: 'x_posting_insufficient_credits',
      cost: 30,
      upgradeUrl: 'https://app.genfeed.ai/settings/credits',
    });
    expect(credits.checkOrganizationCreditsAvailable).toHaveBeenCalledWith(
      'org-1',
      30,
    );
  });

  it('checks a post scheduled for later for the plan only', async () => {
    const { credits, gate } = build({ hasCredits: false });

    await expect(
      gate.check({ ...X_POST, includeCredits: false }),
    ).resolves.toBeNull();
    expect(credits.checkOrganizationCreditsAvailable).not.toHaveBeenCalled();
  });
});
