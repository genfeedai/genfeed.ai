import { NotFoundException } from '@api/exceptions/not-found.exception';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { normalizeReviewDecision, ReviewDecision } from '@genfeedai/contracts';
import { brandGenerationArtifactV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import {
  BRANDED_GENERATION_FEEDBACK_REASONS,
  BRANDED_GENERATION_FEEDBACK_WINDOW_DAYS,
  type BrandedGenerationFeedbackInputV1,
  type BrandedGenerationFeedbackReadV1,
  type BrandedGenerationFeedbackSummaryV1,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-feedback.contract';
import type { Prisma } from '@genfeedai/prisma';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const MS_PER_DAY = 86_400_000;
/** Newest ratings a summary reads; a brand with more still gets a stable sample. */
const SUMMARY_ROW_CAP = 5000;

type FeedbackReason = (typeof BRANDED_GENERATION_FEEDBACK_REASONS)[number];

interface ReceiptOutput {
  artifact: { id: string; kind: string; version: string } | null;
}

/**
 * Thumbs up/down on a branded generation (#5786).
 *
 * The rating is the member's explicit judgment of the output; the receipt
 * stays immutable evidence of how it was made, so the two are joined by the
 * receipt id and never merged. The implicit signals (edited, discarded,
 * reviewed) are read from the saved post when asked for, not recorded, so they
 * cannot drift from the post.
 */
@Injectable()
export class BrandedGenerationFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BrandedGenerationReceiptAccessService,
  ) {}

  private transaction<T>(
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(run, {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    });
  }

  /** A rating is a member's own judgment; an API key cannot give one. */
  private assertMember(actor: BrandedGenerationActorV1): void {
    if (actor.isApiKey)
      throw new ForbiddenException('feedback_member_required');
  }

  private async receipt(
    tx: Prisma.TransactionClient,
    actor: BrandedGenerationActorV1,
    receiptId: string,
  ): Promise<ReceiptOutput> {
    const row = await tx.brandedGenerationReceipt.findFirst({
      select: { projection: true },
      where: scopedWhere(actor.organizationId, {
        brandId: actor.brandId,
        id: receiptId,
      }),
    });
    if (!row) throw new NotFoundException({ message: 'receipt_not_found' });
    const raw = (row.projection as { artifact?: unknown } | null)?.artifact;
    const artifact = brandGenerationArtifactV1Schema
      .nullable()
      .safeParse(raw ?? null);
    return {
      artifact:
        artifact.success && artifact.data
          ? {
              id: artifact.data.id,
              kind: artifact.data.kind,
              version: artifact.data.version,
            }
          : null,
    };
  }

  private async implicit(
    tx: Prisma.TransactionClient,
    actor: BrandedGenerationActorV1,
    output: ReceiptOutput,
  ): Promise<BrandedGenerationFeedbackReadV1['implicit']> {
    const none = {
      isEdited: null,
      isDiscarded: false,
      postStatus: null,
      reviewDecision: null,
    };
    if (output.artifact?.kind !== 'post') return none;
    const post = await tx.post.findFirst({
      select: { description: true, reviewDecision: true, status: true },
      where: scopedWhere(actor.organizationId, { id: output.artifact.id }),
    });
    if (!post) {
      const discarded = await tx.post.findFirst({
        select: { id: true },
        where: scopedWhere(actor.organizationId, {
          id: output.artifact.id,
          isDeleted: true,
        }),
      });
      return { ...none, isDiscarded: discarded !== null };
    }
    const decision = normalizeReviewDecision(post.reviewDecision);
    return {
      isEdited:
        hashBrandedGenerationTextV1(post.description) !==
        output.artifact.version,
      isDiscarded: false,
      postStatus: post.status,
      reviewDecision: decision === ReviewDecision.UNSET ? null : decision,
    };
  }

  private async read(
    tx: Prisma.TransactionClient,
    actor: BrandedGenerationActorV1,
    receiptId: string,
    output: ReceiptOutput,
  ): Promise<BrandedGenerationFeedbackReadV1> {
    const [row, implicit] = await Promise.all([
      tx.brandedGenerationFeedback.findFirst({
        where: scopedWhere(actor.organizationId, {
          actorId: actor.actorId,
          brandId: actor.brandId,
          receiptId,
        }),
      }),
      this.implicit(tx, actor, output),
    ]);
    return {
      id: receiptId,
      implicit,
      rating: row ? (row.rating as 'up' | 'down') : null,
      ratedAt: row ? row.updatedAt.toISOString() : null,
      reasons: row ? (row.reasons as FeedbackReason[]) : [],
      receiptId,
    };
  }

  async get(
    actor: BrandedGenerationActorV1,
    receiptId: string,
  ): Promise<BrandedGenerationFeedbackReadV1> {
    return this.transaction(async (tx) => {
      await this.access.assertBrand(actor, tx);
      const output = await this.receipt(tx, actor, receiptId);
      return this.read(tx, actor, receiptId, output);
    });
  }

  /** Rates the output once per member; rating again replaces the earlier one. */
  async rate(
    actor: BrandedGenerationActorV1,
    receiptId: string,
    input: BrandedGenerationFeedbackInputV1,
  ): Promise<BrandedGenerationFeedbackReadV1> {
    this.assertMember(actor);
    return this.transaction(async (tx) => {
      await this.access.assertBrand(actor, tx);
      const output = await this.receipt(tx, actor, receiptId);
      if (!output.artifact)
        throw new BadRequestException('feedback_receipt_has_no_output');
      // tenant-scope-ignore: re-rating must revive the member's withdrawn (soft-deleted) row; the unique key is org-scoped and the receipt was just proven in this tenant
      await tx.brandedGenerationFeedback.upsert({
        create: {
          actorId: actor.actorId,
          brandId: actor.brandId,
          organizationId: actor.organizationId,
          rating: input.rating,
          reasons: input.reasons,
          receiptId,
        },
        update: {
          isDeleted: false,
          rating: input.rating,
          reasons: input.reasons,
        },
        where: {
          organizationId: actor.organizationId,
          receiptId_actorId: { actorId: actor.actorId, receiptId },
        },
      });
      return this.read(tx, actor, receiptId, output);
    });
  }

  /** Takes the member's rating back; withdrawing nothing is not an error. */
  async withdraw(
    actor: BrandedGenerationActorV1,
    receiptId: string,
  ): Promise<void> {
    this.assertMember(actor);
    await this.transaction(async (tx) => {
      await this.access.assertBrand(actor, tx);
      await this.receipt(tx, actor, receiptId);
      await tx.brandedGenerationFeedback.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(actor.organizationId, {
          actorId: actor.actorId,
          brandId: actor.brandId,
          receiptId,
        }),
      });
    });
  }

  /** How the brand's recent generations were rated, by receipt mode and reason. */
  async summarize(
    actor: BrandedGenerationActorV1,
  ): Promise<BrandedGenerationFeedbackSummaryV1> {
    const since = new Date(
      Date.now() - BRANDED_GENERATION_FEEDBACK_WINDOW_DAYS * MS_PER_DAY,
    );
    return this.transaction(async (tx) => {
      await this.access.assertBrand(actor, tx);
      const rows = await tx.brandedGenerationFeedback.findMany({
        orderBy: { updatedAt: 'desc' },
        select: {
          rating: true,
          reasons: true,
          receipt: { select: { mode: true } },
        },
        take: SUMMARY_ROW_CAP,
        where: scopedWhere(actor.organizationId, {
          brandId: actor.brandId,
          updatedAt: { gte: since },
        }),
      });
      const reasons = new Map<FeedbackReason, number>(
        BRANDED_GENERATION_FEEDBACK_REASONS.map((reason) => [reason, 0]),
      );
      const byMode = new Map<string, { up: number; down: number }>();
      let up = 0;
      let down = 0;
      for (const row of rows) {
        const isUp = row.rating === 'up';
        if (isUp) up += 1;
        else down += 1;
        const tally = byMode.get(row.receipt.mode) ?? { down: 0, up: 0 };
        if (isUp) tally.up += 1;
        else tally.down += 1;
        byMode.set(row.receipt.mode, tally);
        for (const reason of row.reasons as FeedbackReason[]) {
          const count = reasons.get(reason);
          if (count !== undefined) reasons.set(reason, count + 1);
        }
      }
      return {
        byMode: [...byMode.entries()]
          .map(([mode, tally]) => ({ mode, ...tally }))
          .sort((a, b) => a.mode.localeCompare(b.mode)),
        down,
        id: actor.brandId,
        reasons: [...reasons.entries()].map(([reason, count]) => ({
          count,
          reason,
        })),
        up,
        windowDays: BRANDED_GENERATION_FEEDBACK_WINDOW_DAYS,
      };
    });
  }
}
