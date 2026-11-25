import { describe, expect, it } from 'vitest';
import {
  isXPostingBillingErrorCode,
  X_POSTING_INSUFFICIENT_CREDITS_CODE,
  X_POSTING_REQUIRES_PAID_PLAN_CODE,
  xPostingBillingMessage,
  xPostingBillingUrl,
} from './x-posting-billing.contract';

describe('x posting billing contract', () => {
  it('recognises only its own codes', () => {
    expect(isXPostingBillingErrorCode(X_POSTING_REQUIRES_PAID_PLAN_CODE)).toBe(
      true,
    );
    expect(
      isXPostingBillingErrorCode(X_POSTING_INSUFFICIENT_CREDITS_CODE),
    ).toBe(true);
    expect(isXPostingBillingErrorCode('x_quote_refused')).toBe(false);
    expect(isXPostingBillingErrorCode(null)).toBe(false);
  });

  it('sends a free plan to the plans page and an empty wallet to credits', () => {
    expect(
      xPostingBillingUrl(
        X_POSTING_REQUIRES_PAID_PLAN_CODE,
        'https://app.genfeed.ai/',
      ),
    ).toBe('https://app.genfeed.ai/settings/subscription');
    expect(
      xPostingBillingUrl(
        X_POSTING_INSUFFICIENT_CREDITS_CODE,
        'https://app.genfeed.ai',
      ),
    ).toBe('https://app.genfeed.ai/settings/credits');
  });

  it('puts the reason and the link in the message', () => {
    expect(
      xPostingBillingMessage(X_POSTING_REQUIRES_PAID_PLAN_CODE, {
        url: 'https://app.genfeed.ai/settings/subscription',
      }),
    ).toBe(
      'Posting to X needs a paid plan. Choose a plan to publish to X: https://app.genfeed.ai/settings/subscription',
    );
    expect(
      xPostingBillingMessage(X_POSTING_INSUFFICIENT_CREDITS_CODE, {
        hasLink: true,
        url: 'https://app.genfeed.ai/settings/credits',
      }),
    ).toBe(
      'Not enough credits to post to X. Posts with a link cost more than posts without one. Buy credits to publish: https://app.genfeed.ai/settings/credits',
    );
  });
});
