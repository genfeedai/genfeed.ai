import { describe, expect, it } from 'vitest';
import {
  isXPostingBillingErrorCode,
  X_POSTING_INSUFFICIENT_CREDITS_CODE,
  xPostingBillingMessage,
  xPostingBillingUrl,
} from './x-posting-billing.contract';

describe('x posting billing contract', () => {
  it('recognises only its own code', () => {
    expect(
      isXPostingBillingErrorCode(X_POSTING_INSUFFICIENT_CREDITS_CODE),
    ).toBe(true);
    expect(isXPostingBillingErrorCode('x_quote_refused')).toBe(false);
    expect(isXPostingBillingErrorCode(null)).toBe(false);
  });

  it('links to the credits page without doubling the slash', () => {
    expect(xPostingBillingUrl('https://app.genfeed.ai/')).toBe(
      'https://app.genfeed.ai/settings/credits',
    );
  });

  it('puts the reason, the price difference for links and the link in the message', () => {
    expect(
      xPostingBillingMessage({
        url: 'https://app.genfeed.ai/settings/credits',
      }),
    ).toBe(
      'Not enough credits to post to X. Buy credits to publish: https://app.genfeed.ai/settings/credits',
    );
    expect(
      xPostingBillingMessage({
        hasLink: true,
        url: 'https://app.genfeed.ai/settings/credits',
      }),
    ).toBe(
      'Not enough credits to post to X. Posts with a link cost more than posts without one. Buy credits to publish: https://app.genfeed.ai/settings/credits',
    );
  });
});
