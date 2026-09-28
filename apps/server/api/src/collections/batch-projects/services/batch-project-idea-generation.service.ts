import {
  nextIdeaAttempt,
  parseBatchProjectQuote,
  toQueuedDispatch,
} from '@api/collections/batch-projects/services/batch-project-dispatch.util';
import { BatchProjectIdeaDispatchService } from '@api/collections/batch-projects/services/batch-project-idea-dispatch.service';
import { BatchProjectQuoteService } from '@api/collections/batch-projects/services/batch-project-quote.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BatchProjectItemStatus,
  BatchProjectStatus,
  BatchProjectStep,
} from '@genfeedai/contracts';
import type {
  IBatchProjectQuote,
  IBatchProjectQuoteLine,
  IBatchProjectScope,
} from '@genfeedai/contracts/interfaces';
import type { BatchProject, BatchProjectItem } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

/**
 * Idea batches generate server-side against an accepted credit quote
 * (#5463), following the Brand Remix billing contract: the creator accepts
 * one quote covering every idea, bound to the project revision it priced;
 * start refuses with 402 when the balance cannot cover it; every item then
 * runs as a durable job that reserves its line right before its provider
 * call. A retry prices the failed item again as a fresh attempt.
 *
 * Callers hold the project lock (`BatchProjectReconcileService.runExclusive`).
 */
@Injectable()
export class BatchProjectIdeaGenerationService {
  private readonly context = BatchProjectIdeaGenerationService.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly quotes: BatchProjectQuoteService,
    private readonly credits: CreditsUtilsService,
    private readonly dispatcher: BatchProjectIdeaDispatchService,
  ) {}

  /**
   * Price every pending idea of a draft, or the given failed ideas for a
   * retry, and store the quote as the one the creator can accept.
   */
  async quote(
    project: BatchProject & { items: BatchProjectItem[] },
    itemIds: string[] | undefined,
    scope: IBatchProjectScope,
  ): Promise<IBatchProjectQuote> {
    // Each retry accepts its own quote, so a retry quote prices one idea.
    if (itemIds && itemIds.length !== 1) {
      throw new BadRequestException('Quote one failed idea at a time');
    }
    const priced = itemIds
      ? project.items
          .filter(
            (item) =>
              itemIds.includes(item.id) &&
              item.status === BatchProjectItemStatus.FAILED,
          )
          .map((item) => ({ attempt: nextIdeaAttempt(item), item }))
      : project.status === BatchProjectStatus.DRAFT
        ? project.items
            .filter((item) => item.status === BatchProjectItemStatus.PENDING)
            .map((item) => ({ attempt: 1, item }))
        : [];
    if (priced.length === 0 || (itemIds && priced.length !== itemIds.length)) {
      throw new BadRequestException(
        itemIds
          ? 'Only failed ideas can be quoted for a retry'
          : 'Add ideas to a draft batch before quoting it',
      );
    }

    const quote = await this.quotes.build({
      brandId: project.brandId,
      userId: scope.userId,
      items: priced,
      organizationId: scope.organizationId,
      revision: project.revision,
    });
    await this.prisma.batchProject.updateMany({
      data: { quote: toPrismaJson(quote) },
      where: scopedWhere(scope.organizationId, { id: project.id }),
    });
    return quote;
  }

  /** Accept the quote, claim the draft and its ideas, and queue each idea. */
  async start(
    project: BatchProject,
    pending: BatchProjectItem[],
    quoteId: string | undefined,
    scope: IBatchProjectScope,
  ): Promise<void> {
    const quote = this.acceptableQuote(project, quoteId);
    const linesByItem = this.linesFor(
      quote,
      pending.map((item) => ({ attempt: 1, itemId: item.id })),
    );
    await this.assertAffordable(quote, scope.organizationId);

    const dispatchedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.batchProject.updateMany({
        data: {
          quote: toPrismaJson({
            ...quote,
            acceptedAt: dispatchedAt.toISOString(),
          }),
          status: BatchProjectStatus.GENERATING,
          step: BatchProjectStep.REVIEW,
        },
        where: scopedWhere(scope.organizationId, {
          id: project.id,
          revision: quote.revision,
          status: BatchProjectStatus.DRAFT,
        }),
      });
      if (claim.count !== 1) {
        throw new ConflictException('This batch has already started');
      }
      for (const item of pending) {
        await tx.batchProjectItem.updateMany({
          data: {
            dispatch: toPrismaJson(
              toQueuedDispatch(this.lineOf(linesByItem, item.id)),
            ),
            dispatchedAt,
            status: BatchProjectItemStatus.GENERATING,
          },
          where: scopedWhere(scope.organizationId, {
            id: item.id,
            projectId: project.id,
            status: BatchProjectItemStatus.PENDING,
          }),
        });
      }
    });

    for (const item of pending) {
      await this.enqueue(project, this.lineOf(linesByItem, item.id), scope);
    }
    this.logger.log('Batch project ideas queued', {
      batchProjectId: project.id,
      context: this.context,
      itemCount: pending.length,
      organizationId: scope.organizationId,
      quoteId: quote.id,
      total: quote.total,
    });
  }

  /** Rerun one failed idea against a quote line priced for its next attempt. */
  async retry(
    project: BatchProject,
    item: BatchProjectItem,
    quoteId: string | undefined,
    scope: IBatchProjectScope,
  ): Promise<void> {
    const attempt = nextIdeaAttempt(item);
    const quote = this.acceptableQuote(project, quoteId);
    const line = this.lineOf(
      this.linesFor(quote, [{ attempt, itemId: item.id }]),
      item.id,
    );
    await this.assertAffordable(
      { ...quote, total: line.credits },
      scope.organizationId,
    );

    const claim = await this.prisma.batchProjectItem.updateMany({
      data: {
        dispatch: toPrismaJson(toQueuedDispatch(line)),
        dispatchedAt: new Date(),
        error: null,
        outputCategory: null,
        outputIngredientId: null,
        retryCount: item.retryCount + 1,
        status: BatchProjectItemStatus.GENERATING,
      },
      where: scopedWhere(scope.organizationId, {
        id: item.id,
        retryCount: item.retryCount,
        status: BatchProjectItemStatus.FAILED,
      }),
    });
    if (claim.count !== 1) {
      throw new ConflictException('This item is already being retried');
    }
    await this.prisma.batchProject.updateMany({
      data: {
        quote: toPrismaJson({ ...quote, acceptedAt: new Date().toISOString() }),
      },
      where: scopedWhere(scope.organizationId, { id: project.id }),
    });
    await this.enqueue(project, line, scope);
  }

  private async enqueue(
    project: BatchProject,
    line: IBatchProjectQuoteLine,
    scope: IBatchProjectScope,
  ): Promise<void> {
    const job = {
      itemId: line.itemId,
      key: line.key,
      organizationId: scope.organizationId,
      projectId: project.id,
      userId: scope.userId,
    };
    try {
      await this.dispatcher.enqueue(job);
    } catch (error: unknown) {
      this.logger.error('Batch project idea could not be queued', error, {
        batchProjectId: project.id,
        batchProjectItemId: line.itemId,
        context: this.context,
        organizationId: scope.organizationId,
      });
      await this.dispatcher.failItem(job, 'Generation could not be queued');
    }
  }

  /** The stored quote, if it is the one given, current and unexpired. */
  private acceptableQuote(
    project: BatchProject,
    quoteId: string | undefined,
  ): IBatchProjectQuote {
    const quote = parseBatchProjectQuote(project.quote);
    if (!quoteId || !quote || quote.id !== quoteId) {
      throw new BadRequestException(
        'Accept a current quote before generating ideas',
      );
    }
    if (quote.acceptedAt) {
      throw new ConflictException('This quote was already used');
    }
    if (quote.revision !== project.revision) {
      throw new ConflictException(
        'The batch changed after this quote. Request a new quote.',
      );
    }
    if (Date.parse(quote.expiresAt) <= Date.now()) {
      throw new ConflictException('This quote expired. Request a new quote.');
    }
    return quote;
  }

  /** The quote must price exactly the requested items and attempts. */
  private linesFor(
    quote: IBatchProjectQuote,
    wanted: Array<{ attempt: number; itemId: string }>,
  ): Map<string, IBatchProjectQuoteLine> {
    const lines = new Map(quote.items.map((line) => [line.itemId, line]));
    const isExact =
      lines.size === wanted.length &&
      wanted.every(
        ({ attempt, itemId }) => lines.get(itemId)?.attempt === attempt,
      );
    if (!isExact) {
      throw new ConflictException(
        'The quote does not match the ideas to generate. Request a new quote.',
      );
    }
    return lines;
  }

  private lineOf(
    lines: Map<string, IBatchProjectQuoteLine>,
    itemId: string,
  ): IBatchProjectQuoteLine {
    const line = lines.get(itemId);
    if (!line) {
      throw new ConflictException('The quote does not price this idea.');
    }
    return line;
  }

  private async assertAffordable(
    quote: Pick<IBatchProjectQuote, 'total'>,
    organizationId: string,
  ): Promise<void> {
    if (quote.total <= 0) {
      return;
    }
    if (
      await this.credits.checkOrganizationCreditsAvailable(
        organizationId,
        quote.total,
      )
    ) {
      return;
    }
    const balance =
      await this.credits.getOrganizationCreditsBalance(organizationId);
    throw createInsufficientCreditsException(quote.total, balance);
  }
}
