import {
  CreatorDirectoryService,
  type CreatorPaymentReader,
  type PublicCreatorArticle,
} from '@api/collections/creator-payments/services/creator-directory.service';
import { CreatorSubscriptionsService } from '@api/collections/creator-payments/services/creator-subscriptions.service';
import { isPaymentKeyTaken } from '@api/collections/creator-payments/utils/payment-key.util';
import { CreditTransfersService } from '@api/collections/credits/services/credit-transfers.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { CreditTransferKind } from '@genfeedai/contracts';
import {
  ARTICLE_UNLOCK_MAX_PRICE,
  ARTICLE_UNLOCK_MIN_PRICE,
  type ArticleAccessLevel,
  isArticleAccessLevel,
} from '@genfeedai/contracts/constants';
import type {
  CreatorArticleAccessReason,
  ICreatorArticleAccess,
  ICreditTransferResult,
  IUnlockCreatorArticleResult,
} from '@genfeedai/contracts/interfaces/billing';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** What the creator's side knows about one reader and one article. */
type ReaderStanding = {
  reason: CreatorArticleAccessReason | null;
  subscriptionPriceCredits: number | null;
};

function accessLevelOf(article: PublicCreatorArticle): ArticleAccessLevel {
  // An unknown stored level gates the article: never fail open.
  return isArticleAccessLevel(article.accessLevel)
    ? article.accessLevel
    : 'paid';
}

/** The unlock price, when the creator set a valid one on a paid article. */
function unlockPriceOf(article: PublicCreatorArticle): number | null {
  const price = article.unlockPriceCredits;
  return accessLevelOf(article) === 'paid' &&
    typeof price === 'number' &&
    Number.isInteger(price) &&
    price >= ARTICLE_UNLOCK_MIN_PRICE &&
    price <= ARTICLE_UNLOCK_MAX_PRICE
    ? price
    : null;
}

/**
 * Paid articles (#9718): who may read a gated article in full, and the
 * one-time unlock. The public website only ever receives a gated article's
 * preview; a signed-in reader with access gets the full body from here.
 * Access: the creator's own team, a live paid subscription to the creator,
 * or an earlier unlock of this article.
 */
@Traced()
@Injectable()
export class CreatorArticleAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creatorDirectoryService: CreatorDirectoryService,
    private readonly creatorSubscriptionsService: CreatorSubscriptionsService,
    private readonly creditTransfersService: CreditTransfersService,
  ) {}

  async getAccess(
    reader: CreatorPaymentReader,
    articleId: string,
  ): Promise<ICreatorArticleAccess> {
    const article =
      await this.creatorDirectoryService.findPublicArticle(articleId);
    return this.toAccess(article, await this.standing(reader, article));
  }

  /**
   * Charges the unlock price once per reader and article. A reader who
   * already has access is never charged; a retry after a lost response finds
   * the unlock and charges nothing.
   */
  async unlock(
    reader: CreatorPaymentReader,
    articleId: string,
  ): Promise<IUnlockCreatorArticleResult> {
    const article =
      await this.creatorDirectoryService.findPublicArticle(articleId);
    const before = await this.standing(reader, article);
    if (before.reason) {
      return {
        access: this.toAccess(article, before),
        transferId: null,
        wasApplied: false,
      };
    }

    const price = unlockPriceOf(article);
    if (price === null) {
      throw new BusinessLogicException(
        'This article cannot be unlocked on its own',
        { articleId },
        'ARTICLE_NOT_UNLOCKABLE',
      );
    }

    const { creator } = article;
    const readerName = await this.creatorDirectoryService.readerName(reader);
    let transfer: ICreditTransferResult;
    try {
      transfer = await this.creditTransfersService.transfer({
        amount: price,
        // One unlock per reader and article, whichever client sent it.
        idempotencyKey: `article-unlock:${article.id}:${reader.userId}`,
        kind: CreditTransferKind.UNLOCK,
        payeeBrandId: creator.id,
        payeeDescription: `${readerName} unlocked "${article.label}"`,
        payeeOrganizationId: creator.organizationId,
        payerDescription: `Unlocked "${article.label}" by ${creator.label}`,
        payerOrganizationId: reader.organizationId,
        payerUserId: reader.userId,
        subjectId: article.id,
      });
    } catch (error: unknown) {
      if (!isPaymentKeyTaken(error)) throw error;
      // The reader's other workspace paid for this unlock at the same moment.
      const after = await this.standing(reader, article);
      if (!after.reason) throw error;
      return {
        access: this.toAccess(article, after),
        transferId: null,
        wasApplied: false,
      };
    }

    await runWithTenantContext(
      { organizationId: creator.organizationId },
      async () =>
        await this.prisma.articleUnlock.createMany({
          data: [
            {
              articleId: article.id,
              organizationId: creator.organizationId,
              payerOrganizationId: reader.organizationId,
              payerUserId: reader.userId,
              priceCredits: transfer.grossAmount,
              transferId: transfer.transferId,
            },
          ],
          skipDuplicates: true,
        }),
    );

    return {
      access: this.toAccess(article, { ...before, reason: 'unlocked' }),
      transferId: transfer.transferId,
      wasApplied: transfer.wasApplied,
    };
  }

  private async standing(
    reader: CreatorPaymentReader,
    article: PublicCreatorArticle,
  ): Promise<ReaderStanding> {
    const { creator } = article;
    const offer = await this.creatorSubscriptionsService.getOffer(
      reader,
      creator.slug,
    );
    const subscriptionPriceCredits = offer.monthlyPriceCredits;

    if (accessLevelOf(article) === 'public') {
      return { reason: 'public', subscriptionPriceCredits };
    }
    if (
      await this.creatorDirectoryService.isReaderOnCreatorTeam(reader, creator)
    ) {
      return { reason: 'team', subscriptionPriceCredits };
    }
    if (offer.subscription) {
      return { reason: 'subscriber', subscriptionPriceCredits };
    }
    const unlocked = await runWithTenantContext(
      { organizationId: creator.organizationId },
      async () =>
        await this.prisma.articleUnlock.findFirst({
          select: { id: true },
          where: scopedWhere(creator.organizationId, {
            articleId: article.id,
            payerUserId: reader.userId,
          }),
        }),
    );
    return {
      reason: unlocked ? 'unlocked' : null,
      subscriptionPriceCredits,
    };
  }

  private toAccess(
    article: PublicCreatorArticle,
    standing: ReaderStanding,
  ): ICreatorArticleAccess {
    const hasAccess = standing.reason !== null;
    return {
      accessLevel: accessLevelOf(article),
      articleId: article.id,
      content: hasAccess ? (article.content ?? '') : null,
      handle: article.creator.slug,
      hasAccess,
      label: article.label,
      reason: standing.reason,
      slug: article.slug,
      subscriptionPriceCredits: standing.subscriptionPriceCredits,
      unlockPriceCredits: unlockPriceOf(article),
    };
  }
}
