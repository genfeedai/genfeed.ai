import { BetterAuthService } from '@api/auth/better-auth/better-auth.service';
import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { scopedWhere } from '@api/index';
import {
  MarketplaceApiClient,
  type MarketplaceCreditPurchaseInput,
} from '@api/marketplace-integration/marketplace-api-client';
import {
  MARKETPLACE_SERVICE_AUDIENCE,
  MARKETPLACE_SERVICE_SCOPES,
  MARKETPLACE_SERVICE_SUBJECT,
  MARKETPLACE_SERVICE_TOKEN_SECONDS,
  type MarketplaceServiceScope,
} from '@api/marketplace-integration/marketplace-service-auth';
import { usesMeteredCredits } from '@genfeedai/config';
import {
  ActivitySource,
  CreditTransactionCategory,
} from '@genfeedai/contracts';
import type { IMarketplaceCreditPurchaseResult } from '@genfeedai/contracts/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

const PURCHASE_REFERENCE_TYPE = 'marketplace_purchase';
const REFUND_EXPIRY_DAYS = 365;
const LEDGER_CONFLICT_ATTEMPTS = 5;
const LEDGER_CONFLICT_BACKOFF_MS = 25;
const ATTEMPT_ENDED_MESSAGE =
  'This purchase attempt ended and your credits were returned. Start a new purchase to try again.';

/**
 * Pays for a marketplace listing with the buyer organization's credits.
 *
 * The credits are taken first, then the marketplace is asked to record a
 * completed purchase through its signed service call. If the marketplace does
 * not confirm, the credits go back. Every step carries a key derived from the
 * buyer's attempt key, so a retried request takes the credits once and the
 * marketplace holds one purchase.
 *
 * Credits are spent here, not transferred: the store has one seller, Genfeed,
 * so there is no receiving wallet and no seller earns credits.
 */
@Traced()
@Injectable()
export class MarketplaceCreditPurchaseService {
  constructor(
    private readonly logger: LoggerService,
    private readonly marketplaceApiClient: MarketplaceApiClient,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly creditTransactionsService: CreditTransactionsService,
    private readonly betterAuthService: BetterAuthService,
  ) {}

  @HandleErrors('pay for marketplace listing with credits', 'marketplace')
  async payWithCredits(input: {
    idempotencyKey: string;
    listingId: string;
    organizationId: string;
    userId: string;
  }): Promise<IMarketplaceCreditPurchaseResult> {
    if (!usesMeteredCredits()) {
      throw new BusinessLogicException(
        'Paying with credits needs metered credits on this deployment',
        undefined,
        'MARKETPLACE_CREDITS_UNAVAILABLE',
      );
    }

    const { listingId, organizationId, userId } = input;

    // One key per buying attempt, scoped to the buyer, so the ledger's global
    // key space cannot be shared with another organization.
    const callKey = `marketplace-purchase:${organizationId}:${userId}:${listingId}:${input.idempotencyKey.trim()}`;

    // An attempt whose credits went back is over. Charging it again would be
    // a no-op on the ledger (the charge key already exists), so a retry of the
    // same attempt could complete the listing without a net payment.
    if (await this.wasReturned(organizationId, callKey)) {
      throw new ConflictException(ATTEMPT_ENDED_MESSAGE);
    }

    // Both tokens are signed before any credit moves, so a signing failure
    // cannot leave credits taken with no way to record or undo the purchase.
    const recordToken = await this.serviceToken(
      MARKETPLACE_SERVICE_SCOPES.recordPurchase,
    );
    const refundToken = await this.serviceToken(
      MARKETPLACE_SERVICE_SCOPES.refundPurchase,
    );

    // A retry of an attempt that already took credits keeps the amount it
    // took, whatever the listing costs now: the marketplace then records, or
    // refuses, that same amount, and a refusal returns exactly what was taken.
    const alreadyCharged = await this.chargedCredits(organizationId, callKey);
    const credits = alreadyCharged ?? (await this.quotePrice(listingId));

    await this.takeCredits({
      callKey,
      credits,
      listingId,
      organizationId,
      userId,
    });

    const purchase: MarketplaceCreditPurchaseInput = {
      buyerId: userId,
      creditsPaid: credits,
      idempotencyKey: callKey,
      listingId,
      organizationId,
    };
    const recorded = await this.marketplaceApiClient.recordCreditPurchase(
      purchase,
      recordToken,
    );

    if (recorded.status === 'recorded') {
      return this.completeRecorded({
        callKey,
        credits,
        listingId,
        organizationId,
        purchase,
        purchaseId: recorded.purchaseId,
        refundToken,
      });
    }

    if (recorded.status === 'rejected') {
      await this.returnCredits({
        callKey,
        credits,
        listingId,
        organizationId,
        userId,
      });
      this.logger.warn(
        'marketplace refused a credit purchase; credits returned',
        {
          httpStatus: recorded.httpStatus,
          listingId,
          organizationId,
          reason: recorded.reason,
        },
      );
      throw recorded.httpStatus === 409
        ? new ConflictException(
            `${recorded.reason}. Your credits were returned.`,
          )
        : new BadRequestException(
            `${recorded.reason}. Your credits were returned.`,
          );
    }

    // The marketplace did not answer, so the purchase may or may not exist.
    // Ask it to settle the call key, without undoing a purchase that another
    // request of this attempt completed in the meantime. Only when it confirms
    // the purchase is gone (refunded, or never recorded) do the credits go
    // back; when it reports the purchase completed, this request ends with the
    // same result as the one that recorded it.
    const settled = await this.marketplaceApiClient.refundCreditPurchase(
      purchase,
      refundToken,
      { keepCompleted: true },
    );
    if (settled.status === 'completed') {
      return this.completeRecorded({
        callKey,
        credits,
        listingId,
        organizationId,
        purchase,
        purchaseId: settled.purchaseId,
        refundToken,
      });
    }
    if (settled.status === 'unavailable') {
      this.logger.error(
        'marketplace did not confirm a credit purchase',
        undefined,
        {
          listingId,
          organizationId,
        },
      );
      throw new ServiceUnavailableException(
        'We could not confirm your purchase yet. Try again in a moment: you will not be charged twice.',
      );
    }
    await this.returnCredits({
      callKey,
      credits,
      listingId,
      organizationId,
      userId,
    });
    throw new ServiceUnavailableException(
      'The marketplace could not record your purchase. Your credits were returned.',
    );
  }

  /** The purchase exists in the marketplace and this attempt paid for it. */
  private async completeRecorded(input: {
    callKey: string;
    credits: number;
    listingId: string;
    organizationId: string;
    purchase: MarketplaceCreditPurchaseInput;
    purchaseId: string;
    refundToken: string;
  }): Promise<IMarketplaceCreditPurchaseResult> {
    const { callKey, credits, listingId, organizationId } = input;
    // A concurrent request for the same attempt may have returned the
    // credits while this one was recording. Undo the purchase it made.
    if (await this.wasReturned(organizationId, callKey)) {
      const undone = await this.marketplaceApiClient.refundCreditPurchase(
        input.purchase,
        input.refundToken,
      );
      if (undone.status === 'unavailable') {
        this.logger.error(
          'marketplace purchase could not be undone after the credits were returned',
          undefined,
          { listingId, organizationId },
        );
      }
      throw new ConflictException(ATTEMPT_ENDED_MESSAGE);
    }
    return { creditsPaid: credits, listingId, purchaseId: input.purchaseId };
  }

  private serviceToken(scope: MarketplaceServiceScope): Promise<string> {
    return this.betterAuthService.signServiceToken({
      audience: MARKETPLACE_SERVICE_AUDIENCE,
      lifetimeSeconds: MARKETPLACE_SERVICE_TOKEN_SECONDS,
      scope,
      subject: MARKETPLACE_SERVICE_SUBJECT,
    });
  }

  /** The listing's GEN price for a new attempt, or the error that ends it. */
  private async quotePrice(listingId: string): Promise<number> {
    const quote = await this.marketplaceApiClient.getCreditQuote(listingId);
    if (quote.status === 'not-found') {
      throw new NotFoundException('Listing', listingId);
    }
    if (quote.status === 'not-payable') {
      throw new BadRequestException('This listing cannot be paid with credits');
    }
    if (quote.status === 'unavailable') {
      throw new ServiceUnavailableException(
        'The marketplace is unavailable. Nothing was charged.',
      );
    }
    return quote.creditPrice;
  }

  /** The credits an earlier request of this attempt took, if any. */
  private async chargedCredits(
    organizationId: string,
    callKey: string,
  ): Promise<number | null> {
    const charge = await this.creditTransactionsService.findOne(
      scopedWhere(organizationId, {
        category: CreditTransactionCategory.DEDUCT,
        referenceId: callKey,
        referenceType: PURCHASE_REFERENCE_TYPE,
      }),
    );
    return charge ? Math.abs(charge.amount) : null;
  }

  /** Whether the credits taken for this attempt have already gone back. */
  private async wasReturned(
    organizationId: string,
    callKey: string,
  ): Promise<boolean> {
    const refund = await this.creditTransactionsService.findOne(
      scopedWhere(organizationId, {
        category: CreditTransactionCategory.REFUND,
        referenceId: callKey,
        referenceType: PURCHASE_REFERENCE_TYPE,
      }),
    );
    return Boolean(refund);
  }

  /** Take the credits once for this attempt; a low balance takes nothing. */
  private async takeCredits(input: {
    callKey: string;
    credits: number;
    listingId: string;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    try {
      await this.retryOnLedgerConflict(() =>
        this.creditsUtilsService.deductCreditsFromOrganization(
          input.organizationId,
          input.userId,
          input.credits,
          'Marketplace purchase',
          ActivitySource.WEB,
          {
            idempotencyKey: `${input.callKey}:charge`,
            metadata: { listingId: input.listingId },
            referenceId: input.callKey,
            referenceType: PURCHASE_REFERENCE_TYPE,
          },
        ),
      );
    } catch (error: unknown) {
      if (
        error instanceof BusinessLogicException &&
        error.errorCode === 'INSUFFICIENT_CREDITS'
      ) {
        const available = Math.max(
          0,
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            input.organizationId,
          ),
        );
        const missing = Math.max(0, input.credits - available);
        throw new HttpException(
          {
            detail: `You need ${missing} more GEN to buy this. It costs ${input.credits} and you have ${available}. Nothing was taken.`,
            meta: { available, missing, required: input.credits },
            title: 'Insufficient credits',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      throw error;
    }
  }

  private async returnCredits(input: {
    callKey: string;
    credits: number;
    listingId: string;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFUND_EXPIRY_DAYS);
    await this.retryOnLedgerConflict(() =>
      this.creditsUtilsService.refundOrganizationCredits(
        input.organizationId,
        input.credits,
        'marketplace-purchase-refund',
        'Marketplace purchase not completed - credit refund',
        expiresAt,
        {
          actorUserId: input.userId,
          idempotencyKey: `${input.callKey}:refund`,
          metadata: { listingId: input.listingId },
          referenceId: input.callKey,
          referenceType: PURCHASE_REFERENCE_TYPE,
        },
      ),
    );
  }

  /**
   * The ledger writes are Serializable transactions, and Postgres aborts one
   * that overlaps another buyer's write (P2034, SQLSTATE 40001) even when they
   * touch different organizations. The aborted transaction rolled back whole
   * and both writes carry an idempotency key, so running it again is safe.
   * A lost refund would leave a buyer without credits for a purchase that was
   * never recorded.
   */
  private async retryOnLedgerConflict(run: () => Promise<void>): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await run();
      } catch (error: unknown) {
        if (
          !isCreditTransactionConflict(error) ||
          attempt >= LEDGER_CONFLICT_ATTEMPTS
        ) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            LEDGER_CONFLICT_BACKOFF_MS * attempt * (1 + Math.random()),
          ),
        );
      }
    }
  }
}
