import {
  AFFILIATE_REWARD_RATE_PERCENT,
  AFFILIATE_REWARD_WINDOW_MONTHS,
  AFFILIATE_SETTLEMENT_DELAY_DAYS,
} from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import {
  AFFILIATE_FAQ,
  AFFILIATE_PROGRAM,
  AFFILIATE_STEPS,
} from './affiliate-program.data';

describe('affiliate program copy', () => {
  it('quotes the rate, window and hold from the constants billing settles with', () => {
    expect(AFFILIATE_PROGRAM.earnings.title).toBe(
      `${AFFILIATE_REWARD_RATE_PERCENT}% in credits, for ${AFFILIATE_REWARD_WINDOW_MONTHS} months`,
    );
    expect(AFFILIATE_PROGRAM.payout.description).toContain(
      `${AFFILIATE_SETTLEMENT_DELAY_DAYS} days`,
    );
    expect(AFFILIATE_PROGRAM.payout.description).toContain(
      `${AFFILIATE_REWARD_WINDOW_MONTHS} months`,
    );
  });

  it('keeps every FAQ question unique', () => {
    const questions = AFFILIATE_FAQ.map((item) => item.question);

    expect(new Set(questions).size).toBe(questions.length);
  });

  it('walks three steps from link to reward', () => {
    expect(AFFILIATE_STEPS.map((step) => step.title)).toEqual([
      'Get your link',
      'Share it',
      'Earn credits',
    ]);
  });
});
