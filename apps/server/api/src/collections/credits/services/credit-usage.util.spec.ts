import {
  CREDIT_USAGE_AMOUNT_SQL,
  CREDIT_USAGE_BRAND_SQL,
  CREDIT_USAGE_FILTER_SQL,
  creditUsageWhere,
  netCreditUsage,
  signedCreditUsage,
} from '@api/collections/credits/services/credit-usage.util';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import { REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

describe('credit usage semantics', () => {
  it('selects deductions and refunds, keeping rows without a referenceType', () => {
    expect(creditUsageWhere()).toEqual({
      category: {
        in: [
          CreditTransactionCategory.DEDUCT,
          CreditTransactionCategory.REFUND,
        ],
      },
      OR: [
        { referenceType: null },
        { referenceType: { not: REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE } },
      ],
    });
  });

  it('counts refunds negative regardless of the stored sign', () => {
    expect(
      signedCreditUsage({
        amount: 4,
        category: CreditTransactionCategory.DEDUCT,
      }),
    ).toBe(4);
    expect(
      signedCreditUsage({
        amount: -4,
        category: CreditTransactionCategory.DEDUCT,
      }),
    ).toBe(4);
    expect(
      signedCreditUsage({
        amount: 3,
        category: CreditTransactionCategory.REFUND,
      }),
    ).toBe(-3);
    expect(signedCreditUsage({ amount: null, category: null })).toBe(0);
  });

  it('nets grouped category sums', () => {
    expect(
      netCreditUsage([
        { _sum: { amount: 10 }, category: CreditTransactionCategory.DEDUCT },
        { _sum: { amount: 3 }, category: CreditTransactionCategory.REFUND },
        { _sum: { amount: null }, category: CreditTransactionCategory.DEDUCT },
      ]),
    ).toBe(7);
    expect(netCreditUsage([])).toBe(0);
  });

  it('builds the SQL filter, signed amount, and brand expressions', () => {
    expect(CREDIT_USAGE_FILTER_SQL.sql).toBe(
      `"category" IN (?, ?) AND "referenceType" IS DISTINCT FROM ?`,
    );
    expect(CREDIT_USAGE_FILTER_SQL.values).toEqual([
      CreditTransactionCategory.DEDUCT,
      CreditTransactionCategory.REFUND,
      REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE,
    ]);
    expect(CREDIT_USAGE_AMOUNT_SQL.sql).toBe(
      `CASE WHEN "category" = ? THEN -ABS("amount") ELSE ABS("amount") END`,
    );
    expect(CREDIT_USAGE_AMOUNT_SQL.values).toEqual([
      CreditTransactionCategory.REFUND,
    ]);
    expect(CREDIT_USAGE_BRAND_SQL.sql).toBe(
      `COALESCE("brandId", NULLIF("metadata"->>'brandId', ''))`,
    );
  });
});
