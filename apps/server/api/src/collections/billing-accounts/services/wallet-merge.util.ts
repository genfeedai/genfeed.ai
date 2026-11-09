import type { Prisma } from '@genfeedai/prisma';

type MergedWallet = {
  balance: number;
  earnedBalance: number;
  heldAmount: number;
};

/**
 * The update that folds an organization's own wallet into its billing
 * account's wallet: settled, held and earned credits all move across.
 *
 * Earned credits stay within `[0, merged balance]`, as every other wallet
 * write keeps them: a wallet in debt that merges into one holding earned
 * credits pays that debt from them first. The earned total is written as an
 * absolute value, so the caller guards the write on the target's version.
 */
export function walletMergeUpdate(
  wallet: MergedWallet,
  into: MergedWallet,
): Prisma.CreditBalanceUpdateManyMutationInput {
  const balance = into.balance + wallet.balance;
  return {
    balance: { increment: wallet.balance },
    earnedBalance: Math.max(
      0,
      Math.min(into.earnedBalance + wallet.earnedBalance, balance),
    ),
    heldAmount: { increment: wallet.heldAmount },
    version: { increment: 1 },
  };
}
