import { XPostingBillingGate } from '@api/common/subscriptions/x-posting-billing-gate.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const X_POST = {
  appUrl: 'https://app.genfeed.ai',
  organizationId: 'org-1',
  platform: CredentialPlatform.TWITTER,
  text: 'Launch note',
};

function build(hasCredits: boolean) {
  const credits = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(hasCredits),
  };
  return { credits, gate: new XPostingBillingGate(credits as never) };
}

describe('XPostingBillingGate', () => {
  it('lets every other platform through without reading the wallet', async () => {
    const { credits, gate } = build(false);

    await expect(
      gate.check({ ...X_POST, platform: CredentialPlatform.INSTAGRAM }),
    ).resolves.toBeNull();
    expect(credits.checkOrganizationCreditsAvailable).not.toHaveBeenCalled();
  });

  it('lets an X post through when the wallet covers it', async () => {
    const { gate } = build(true);

    await expect(gate.check(X_POST)).resolves.toBeNull();
  });

  it('tells an empty wallet what the post costs and where to buy credits', async () => {
    const { credits, gate } = build(false);

    await expect(
      gate.check({ ...X_POST, text: 'New drop https://genfeed.ai/drop' }),
    ).resolves.toEqual({
      code: 'x_posting_insufficient_credits',
      cost: 30,
      message:
        'Not enough credits to post to X. Posts with a link cost more than posts without one. Buy credits to publish: https://app.genfeed.ai/settings/credits',
      upgradeUrl: 'https://app.genfeed.ai/settings/credits',
    });
    expect(credits.checkOrganizationCreditsAvailable).toHaveBeenCalledWith(
      'org-1',
      30,
    );
  });
});
