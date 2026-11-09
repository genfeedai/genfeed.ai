import { randomUUID } from 'node:crypto';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { BALANCE_TX_OPTIONS } from '@api/collections/credits/services/credit-transaction-options';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  type PrismaTransactionClient,
  TransactionUtil,
} from '@api/helpers/utils/transaction/transaction.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { usesMeteredCredits } from '@genfeedai/config';
import {
  CreditTransactionCategory,
  CreditTransferKind,
} from '@genfeedai/contracts';
import {
  CREATOR_PAYMENT_FEE_BPS,
  CREATOR_PAYMENT_REFERENCE_TYPE,
} from '@genfeedai/contracts/constants';
import type {
  ICreditTransferInput,
  ICreditTransferLedgerMetadata,
  ICreditTransferResult,
  ICreditWalletSnapshot,
} from '@genfeedai/contracts/interfaces/billing';
import type { CreditTransaction } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** Largest single creator payment, in credits. */
export const MAX_CREDIT_TRANSFER_AMOUNT = 100_000;
const MAX_TRANSFER_ATTEMPTS = 3;
const MAX_MESSAGE_LENGTH = 280;

type TransferAmounts = {
  feeAmount: number;
  grossAmount: number;
  netAmount: number;
};

type TransferLeg = 'in' | 'out';

/** Fee withheld from a gross amount, rounded down to whole credits. */
export function creatorPaymentFee(grossAmount: number): number {
  return Math.floor((grossAmount * CREATOR_PAYMENT_FEE_BPS) / 10_000);
}

/**
 * Moves credits from one organization to another (tips, creator
 * subscriptions, unlocks), exactly once.
 *
 * A transfer is two ledger rows written in one serializable transaction: a
 * `transfer-out` on the payer and a `transfer-in` on the creator, sharing
 * `referenceId` (the transfer id) and `referenceType`. The payer's debit goes
 * through the same conditional wallet update every spend uses, so concurrent
 * transfers can never overdraw it. The creator's credit is marked earned: it
 * never expires and survives plan resets.
 *
 * This is the one service allowed to write two organizations' wallets. Each
 * leg runs in its own organization's tenant context, so every query still
 * carries the organization it touches.
 */
@Traced()
@Injectable()
export class CreditTransfersService {
  constructor(
    private readonly billingAccountsService: BillingAccountsService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly creditTransactionsService: CreditTransactionsService,
    private readonly transactionUtil: TransactionUtil,
    private readonly websocketService: NotificationsPublisherService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly logger: LoggerService,
  ) {}

  async transfer(input: ICreditTransferInput): Promise<ICreditTransferResult> {
    this.assertTransferable(input);
    const amounts = this.toAmounts(input.amount);
    await this.assertPayerHasPaid(input.payerOrganizationId);

    const result = await this.runWithRetry((tx) =>
      this.transferCore(input, amounts, tx),
    );

    if (result.wasApplied) {
      await this.publishBalances(result);
      this.logger.log('credit transfer applied', {
        grossAmount: result.grossAmount,
        kind: result.kind,
        payeeOrganizationId: result.payeeOrganizationId,
        payerOrganizationId: result.payerOrganizationId,
        transferId: result.transferId,
      });
    }

    return result;
  }

  private assertTransferable(input: ICreditTransferInput): void {
    if (!usesMeteredCredits()) {
      throw new BusinessLogicException(
        'Credit payments need metered credits on this deployment',
        undefined,
        'CREDIT_TRANSFER_UNAVAILABLE',
      );
    }
    if (!input.payerOrganizationId || !input.payeeOrganizationId) {
      throw new BusinessLogicException(
        'A credit payment needs a payer and a creator',
        undefined,
        'INVALID_CREDIT_TRANSFER',
      );
    }
    if (input.payerOrganizationId === input.payeeOrganizationId) {
      throw new BusinessLogicException(
        'You cannot pay your own organization',
        undefined,
        'CREDIT_TRANSFER_TO_SELF',
      );
    }
    if (
      !Number.isInteger(input.amount) ||
      input.amount <= 0 ||
      input.amount > MAX_CREDIT_TRANSFER_AMOUNT
    ) {
      throw new BusinessLogicException(
        `A credit payment must be a whole number between 1 and ${MAX_CREDIT_TRANSFER_AMOUNT}`,
        { amount: input.amount },
        'INVALID_CREDIT_TRANSFER_AMOUNT',
      );
    }
    if (!input.idempotencyKey?.trim()) {
      throw new BusinessLogicException(
        'A credit payment needs an idempotency key',
        undefined,
        'INVALID_CREDIT_TRANSFER',
      );
    }
    if ((input.message?.length ?? 0) > MAX_MESSAGE_LENGTH) {
      throw new BusinessLogicException(
        `A payment message is at most ${MAX_MESSAGE_LENGTH} characters`,
        undefined,
        'INVALID_CREDIT_TRANSFER',
      );
    }
  }

  private toAmounts(grossAmount: number): TransferAmounts {
    const feeAmount = creatorPaymentFee(grossAmount);
    return { feeAmount, grossAmount, netAmount: grossAmount - feeAmount };
  }

  /**
   * Free trial credits cannot be moved to another organization: otherwise new
   * accounts could be farmed and their trial credits pooled into one wallet.
   * Only an organization that has paid for credits can send them.
   */
  private async assertPayerHasPaid(payerOrganizationId: string): Promise<void> {
    const latestPaidGrant = await runWithTenantContext(
      { organizationId: payerOrganizationId },
      () =>
        this.creditTransactionsService.getLatestPaidGrantCredits(
          payerOrganizationId,
        ),
    );
    if (latestPaidGrant === null) {
      throw new BusinessLogicException(
        'Buy credits before paying a creator. Free trial credits cannot be sent.',
        undefined,
        'CREDIT_TRANSFER_REQUIRES_PURCHASE',
      );
    }
  }

  private async runWithRetry(
    work: (tx: PrismaTransactionClient) => Promise<ICreditTransferResult>,
  ): Promise<ICreditTransferResult> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.transactionUtil.runInTransaction(
          work,
          BALANCE_TX_OPTIONS,
        );
      } catch (error: unknown) {
        if (
          !isCreditTransactionConflict(error) ||
          attempt >= MAX_TRANSFER_ATTEMPTS
        ) {
          throw error;
        }
      }
    }
  }

  private async transferCore(
    input: ICreditTransferInput,
    amounts: TransferAmounts,
    tx: PrismaTransactionClient,
  ): Promise<ICreditTransferResult> {
    const payerOrganizationId = input.payerOrganizationId;
    const payeeOrganizationId = input.payeeOrganizationId;

    const replay = await runWithTenantContext(
      { organizationId: payerOrganizationId },
      () =>
        tx.creditTransaction.findFirst({
          where: scopedWhere(payerOrganizationId, {
            category: CreditTransactionCategory.TRANSFER_OUT,
            idempotencyKey: this.legKey(input, 'out'),
          }),
        }),
    );
    if (replay) {
      return this.toReplayResult(input, replay);
    }

    const transferId = randomUUID();
    const metadata = (
      counterpartyOrganizationId: string,
    ): ICreditTransferLedgerMetadata => ({
      counterpartyOrganizationId,
      ...amounts,
      kind: input.kind,
      ...(input.message?.trim() ? { message: input.message.trim() } : {}),
      ...(input.payeeBrandId ? { payeeBrandId: input.payeeBrandId } : {}),
      payerUserId: input.payerUserId,
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      transferId,
    });

    const payerAfter = await runWithTenantContext(
      { organizationId: payerOrganizationId },
      async () => {
        const before = await this.walletSnapshot(payerOrganizationId, tx);
        const after = await this.creditBalanceService.applyDelta(
          payerOrganizationId,
          {
            balanceDelta: -amounts.grossAmount,
            billingAccountId: before.billingAccountId,
          },
          tx,
        );
        await this.creditTransactionsService.createTransactionEntry(
          payerOrganizationId,
          CreditTransactionCategory.TRANSFER_OUT,
          amounts.grossAmount,
          before.available,
          after.available,
          input.kind,
          input.payerDescription,
          undefined,
          tx,
          {
            actorUserId: input.payerUserId,
            ...(before.billingAccountId
              ? { billingAccountId: before.billingAccountId }
              : {}),
            idempotencyKey: this.legKey(input, 'out'),
            metadata: { ...metadata(payeeOrganizationId) },
            referenceId: transferId,
            referenceType: CREATOR_PAYMENT_REFERENCE_TYPE,
          },
        );
        return after;
      },
    );

    await runWithTenantContext(
      { organizationId: payeeOrganizationId },
      async () => {
        const before = await this.walletSnapshot(payeeOrganizationId, tx);
        const after = await this.creditBalanceService.applyDelta(
          payeeOrganizationId,
          {
            balanceDelta: amounts.netAmount,
            billingAccountId: before.billingAccountId,
            earnedDelta: amounts.netAmount,
          },
          tx,
        );
        await this.creditTransactionsService.createTransactionEntry(
          payeeOrganizationId,
          CreditTransactionCategory.TRANSFER_IN,
          amounts.netAmount,
          before.available,
          after.available,
          input.kind,
          input.payeeDescription,
          undefined,
          tx,
          {
            ...(before.billingAccountId
              ? { billingAccountId: before.billingAccountId }
              : {}),
            ...(input.payeeBrandId ? { brandId: input.payeeBrandId } : {}),
            idempotencyKey: this.legKey(input, 'in'),
            metadata: { ...metadata(payerOrganizationId) },
            referenceId: transferId,
            referenceType: CREATOR_PAYMENT_REFERENCE_TYPE,
          },
        );
      },
    );

    return {
      ...amounts,
      kind: input.kind,
      payeeOrganizationId,
      payerBalanceAfter: payerAfter.available,
      payerOrganizationId,
      transferId,
      wasApplied: true,
    };
  }

  /**
   * Ledger idempotency keys are unique across every organization, so the
   * caller's key is namespaced by payer and leg.
   */
  private legKey(input: ICreditTransferInput, leg: TransferLeg): string {
    return `credit-transfer:${input.payerOrganizationId}:${input.idempotencyKey.trim()}:${leg}`;
  }

  private async walletSnapshot(
    organizationId: string,
    tx: PrismaTransactionClient,
  ): Promise<ICreditWalletSnapshot> {
    const account =
      await this.billingAccountsService.resolveForOrganization(organizationId);
    const balance = await this.creditBalanceService.getOrCreateBalance(
      organizationId,
      tx,
      account.id,
    );
    return this.creditBalanceService.toSnapshot(balance);
  }

  private toReplayResult(
    input: ICreditTransferInput,
    replay: CreditTransaction,
  ): ICreditTransferResult {
    const metadata = readTransferMetadata(replay.metadata);
    const grossAmount = metadata?.grossAmount ?? replay.amount;
    const feeAmount = metadata?.feeAmount ?? 0;
    return {
      feeAmount,
      grossAmount,
      kind: metadata?.kind ?? input.kind,
      netAmount: metadata?.netAmount ?? grossAmount - feeAmount,
      payeeOrganizationId:
        metadata?.counterpartyOrganizationId ?? input.payeeOrganizationId,
      payerBalanceAfter: replay.balanceAfter ?? 0,
      payerOrganizationId: input.payerOrganizationId,
      transferId: replay.referenceId ?? '',
      wasApplied: false,
    };
  }

  private async publishBalances(result: ICreditTransferResult): Promise<void> {
    await this.websocketService.emit(`/credits/${result.payerOrganizationId}`, {
      balance: result.payerBalanceAfter,
    });
    await Promise.all([
      this.accessBootstrapCacheService.invalidateForOrganization(
        result.payerOrganizationId,
      ),
      this.accessBootstrapCacheService.invalidateForOrganization(
        result.payeeOrganizationId,
      ),
    ]);
  }
}

type TransferReplayMetadata = Partial<
  Pick<
    ICreditTransferLedgerMetadata,
    | 'counterpartyOrganizationId'
    | 'feeAmount'
    | 'grossAmount'
    | 'kind'
    | 'netAmount'
  >
>;

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function readTransferMetadata(value: unknown): TransferReplayMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const kind = Reflect.get(value, 'kind');
  const counterparty = Reflect.get(value, 'counterpartyOrganizationId');
  return {
    counterpartyOrganizationId:
      typeof counterparty === 'string' ? counterparty : undefined,
    feeAmount: readNumber(Reflect.get(value, 'feeAmount')),
    grossAmount: readNumber(Reflect.get(value, 'grossAmount')),
    kind: Object.values(CreditTransferKind).find(
      (candidate) => candidate === kind,
    ),
    netAmount: readNumber(Reflect.get(value, 'netAmount')),
  };
}
