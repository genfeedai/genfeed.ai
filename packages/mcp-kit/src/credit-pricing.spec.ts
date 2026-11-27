import { describe, expect, it } from 'vitest';
import {
  appendCreditPricingDescription,
  describeCreditPricing,
  fixedCreditPricing,
  isSpendingCreditPricing,
} from './credit-pricing';

describe('credit pricing', () => {
  it('counts a call as spending when any pricing mode can charge', () => {
    expect(isSpendingCreditPricing(fixedCreditPricing(0), 0)).toBe(false);
    expect(isSpendingCreditPricing(fixedCreditPricing(0), 3)).toBe(true);
    expect(isSpendingCreditPricing(fixedCreditPricing(5), 0)).toBe(true);
    expect(
      isSpendingCreditPricing(
        { maximum: 0, minimum: 0, mode: 'variable', unit: 'run' },
        0,
      ),
    ).toBe(false);
    expect(
      isSpendingCreditPricing(
        { maximum: 10, minimum: 0, mode: 'variable', unit: 'run' },
        0,
      ),
    ).toBe(true);
    expect(
      isSpendingCreditPricing({ mode: 'quote', quoteTool: 'quote_job' }, 0),
    ).toBe(true);
  });

  it('describes each pricing mode in one sentence', () => {
    expect(describeCreditPricing(fixedCreditPricing(0))).toBe(
      'Costs 0 credits.',
    );
    expect(describeCreditPricing(fixedCreditPricing(4))).toBe(
      'Costs 4 credits.',
    );
    expect(
      describeCreditPricing({
        maximum: 9,
        minimum: 1,
        mode: 'variable',
        unit: 'render',
      }),
    ).toBe('Variable cost: 1–9 credits per render.');
    expect(
      describeCreditPricing({ mode: 'quote', quoteTool: 'quote_job' }),
    ).toBe('Cost comes from the approved quote_job quote.');
  });

  it('appends a non-fixed price to the description once', () => {
    const quote = { mode: 'quote', quoteTool: 'quote_job' } as const;
    const once = appendCreditPricingDescription('Runs a job.', quote);
    expect(once).toBe(
      'Runs a job. Cost comes from the approved quote_job quote.',
    );
    expect(appendCreditPricingDescription(once, quote)).toBe(once);
    expect(
      appendCreditPricingDescription('Runs a job.', fixedCreditPricing(2)),
    ).toBe('Runs a job.');
    expect(appendCreditPricingDescription('Runs a job.', undefined)).toBe(
      'Runs a job.',
    );
  });
});
