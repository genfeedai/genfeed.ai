import { CreditTransactionCategory } from '@genfeedai/contracts';
import { REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE } from '@genfeedai/contracts/constants';
import { signedCreditUsage } from './credit-usage.util';

interface CycleLedgerEntry {
  amount: number;
  balanceAfter?: number | null;
  category?: string;
  referenceType?: string | null;
}

const INFLOW_CATEGORIES = new Set<string>([
  CreditTransactionCategory.ADD,
  CreditTransactionCategory.REFUND,
  CreditTransactionCategory.ROLLOVER,
]);

/**
 * Cycle totals from the ledger, counted from the latest reset in the cycle.
 *
 * `cycleUsed` is read from the ledger rather than inferred from the balance:
 * the wallet is one pool, so a top-up on top of the plan grant keeps the
 * balance above the plan size and would otherwise read as nothing spent. It
 * follows the shared usage definition (deductions net of refunds, referral
 * reward reversals excluded).
 */
export function computeCycleCredits(
  previousBalanceAfter: number,
  cycleTransactions: readonly CycleLedgerEntry[],
): { cycleTotal: number; cycleUsed: number } {
  const latestResetIndex = cycleTransactions.reduce(
    (latest, transaction, i) =>
      transaction.category === CreditTransactionCategory.RESET ? i : latest,
    -1,
  );

  const baseBalance =
    latestResetIndex >= 0
      ? (cycleTransactions[latestResetIndex]?.balanceAfter ?? 0)
      : previousBalanceAfter;
  const sinceReset = cycleTransactions.slice(latestResetIndex + 1);

  const inflows = sinceReset
    .filter(
      (transaction) =>
        transaction.category !== undefined &&
        INFLOW_CATEGORIES.has(transaction.category) &&
        transaction.amount > 0,
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const cycleUsed = sinceReset
    .filter(
      (transaction) =>
        (transaction.category === CreditTransactionCategory.DEDUCT ||
          transaction.category === CreditTransactionCategory.REFUND) &&
        transaction.referenceType !== REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE,
    )
    .reduce((sum, transaction) => sum + signedCreditUsage(transaction), 0);

  return {
    cycleTotal: Math.max(0, baseBalance + inflows),
    cycleUsed: Math.max(0, cycleUsed),
  };
}
