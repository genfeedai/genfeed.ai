import {
  CreatorDirectoryService,
  type CreatorPaymentReader,
  type PublicCreator,
} from '@api/collections/creator-payments/services/creator-directory.service';
import { CreditTransfersService } from '@api/collections/credits/services/credit-transfers.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { CreditTransferKind } from '@genfeedai/contracts';
import {
  CREATOR_TIP_MAX_AMOUNT,
  CREATOR_TIP_MIN_AMOUNT,
} from '@genfeedai/contracts/constants';
import type {
  ICreatorTipRequest,
  ICreatorTipResult,
  ICreatorTipTarget,
} from '@genfeedai/contracts/interfaces/billing';
import { ArticleStatus } from '@genfeedai/prisma';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/**
 * Tips: a signed-in reader sends credits to a creator from their public
 * profile or an article (#9716). The creator is a public brand; the credits
 * land in that brand's organization through the transfer ledger.
 */
@Traced()
@Injectable()
export class CreatorTipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creatorDirectoryService: CreatorDirectoryService,
    private readonly creditTransfersService: CreditTransfersService,
  ) {}

  async getTarget(
    reader: CreatorPaymentReader,
    handle: string,
  ): Promise<ICreatorTipTarget> {
    const creator =
      await this.creatorDirectoryService.findPublicCreator(handle);
    return {
      brandId: creator.id,
      handle: creator.slug,
      isTippable: !(await this.creatorDirectoryService.isReaderOnCreatorTeam(
        reader,
        creator,
      )),
      label: creator.label,
    };
  }

  async tip(
    reader: CreatorPaymentReader,
    request: ICreatorTipRequest,
  ): Promise<ICreatorTipResult> {
    if (
      !Number.isInteger(request.amount) ||
      request.amount < CREATOR_TIP_MIN_AMOUNT ||
      request.amount > CREATOR_TIP_MAX_AMOUNT
    ) {
      throw new BusinessLogicException(
        `A tip must be a whole number of credits between ${CREATOR_TIP_MIN_AMOUNT} and ${CREATOR_TIP_MAX_AMOUNT}`,
        { amount: request.amount },
        'INVALID_TIP_AMOUNT',
      );
    }

    const creator = await this.creatorDirectoryService.findPublicCreator(
      request.handle,
    );
    if (
      await this.creatorDirectoryService.isReaderOnCreatorTeam(reader, creator)
    ) {
      throw new BusinessLogicException(
        'You cannot tip a creator whose workspace you belong to',
        undefined,
        'TIP_TO_OWN_TEAM',
      );
    }

    const articleTitle = request.articleId
      ? await this.findPublishedArticleTitle(creator, request.articleId)
      : null;
    const readerName = await this.creatorDirectoryService.readerName(reader);
    const onArticle = articleTitle ? ` on "${articleTitle}"` : '';

    const transfer = await this.creditTransfersService.transfer({
      amount: request.amount,
      idempotencyKey: `tip:${reader.userId}:${request.idempotencyKey}`,
      kind: CreditTransferKind.TIP,
      ...(request.message?.trim() ? { message: request.message.trim() } : {}),
      payeeBrandId: creator.id,
      payeeDescription: `Tip from ${readerName}${onArticle}`,
      payeeOrganizationId: creator.organizationId,
      payerDescription: `Tip to ${creator.label}${onArticle}`,
      payerOrganizationId: reader.organizationId,
      payerUserId: reader.userId,
      subjectId: request.articleId ?? creator.id,
    });

    return {
      amount: transfer.grossAmount,
      balanceAfter: transfer.payerBalanceAfter,
      creatorLabel: creator.label,
      transferId: transfer.transferId,
      wasApplied: transfer.wasApplied,
    };
  }

  private async findPublishedArticleTitle(
    creator: PublicCreator,
    articleId: string,
  ): Promise<string> {
    const article = await runWithTenantContext(
      { organizationId: creator.organizationId },
      async () =>
        await this.prisma.article.findFirst({
          select: { label: true },
          where: scopedWhere(creator.organizationId, {
            brandId: creator.id,
            id: articleId,
            status: ArticleStatus.PUBLISHED,
          }),
        }),
    );
    if (!article) {
      throw new NotFoundException('Article');
    }
    return article.label;
  }
}
