import type { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { withEarnedAmount } from '@api/collections/credits/services/credit-earned-amount.util';
import type { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import type {
  IAddCreditsOptions,
  ICreditWalletSnapshot,
} from '@genfeedai/contracts/interfaces/billing';
import { traced } from '@libs/tracing/traced';

/**
 * Puts a refund into the wallet and writes its ledger row. The earned credits
 * that spends consumed come back as earned, up to the refund, so a refunded
 * spend does not turn them into credits a plan reset removes.
 */
export const applyCreditRefund = traced(
  'applyCreditRefund',
  async (
    balances: Pick<CreditBalanceService, 'applyDelta'>,
    ledger: Pick<CreditTransactionsService, 'createTransactionEntry'>,
    input: {
      creditsToRefund: number;
      description: string;
      expiresAt: Date;
      options?: IAddCreditsOptions;
      organizationId: string;
      source: string;
      wallet: ICreditWalletSnapshot & { billingAccountId: string };
    },
    tx?: PrismaTransactionClient,
  ) => {
    const { creditsToRefund, options, organizationId, wallet } = input;
    const currentBalance = wallet.available;
    const newBalance = currentBalance + creditsToRefund;
    const { earnedRestored } = await balances.applyDelta(
      organizationId,
      {
        balanceDelta: creditsToRefund,
        billingAccountId: wallet.billingAccountId,
        restoreEarnedUpTo: creditsToRefund,
      },
      tx,
    );
    await ledger.createTransactionEntry(
      organizationId,
      CreditTransactionCategory.REFUND,
      creditsToRefund,
      currentBalance,
      newBalance,
      input.source,
      input.description,
      input.expiresAt,
      tx,
      {
        ...options,
        ...withEarnedAmount(options?.metadata, earnedRestored),
      },
    );
    return { currentBalance, newBalance, wasApplied: true };
  },
);
