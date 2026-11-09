import type { Prisma } from '@genfeedai/prisma';

type MergedWallet = {
  balance: number;
  earnedBalance: number;
  heldAmount: number;
};

/**
 * The update that folds an organization's own wallet into its billing
 * account's wallet: settled, held and earned credits all move across.
 */
export function walletMergeIncrement(
  wallet: MergedWallet,
): Prisma.CreditBalanceUpdateManyMutationInput {
  return {
    balance: { increment: wallet.balance },
    earnedBalance: { increment: wallet.earnedBalance },
    heldAmount: { increment: wallet.heldAmount },
    version: { increment: 1 },
  };
}
