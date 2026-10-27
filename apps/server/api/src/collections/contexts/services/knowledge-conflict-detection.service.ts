import { KnowledgeConflictJudgeService } from '@api/collections/contexts/services/knowledge-conflict-judge.service';
import {
  buildConflictCandidateQuery,
  type KnowledgeConflictCandidateRow,
} from '@api/collections/contexts/utils/knowledge-conflict-candidate-query.util';
import {
  type AcceptedConflict,
  clipConflictPassage,
} from '@api/collections/contexts/utils/knowledge-conflict-judge-prompt.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  KnowledgeConflictStatus,
  KnowledgeProcessingState,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

/** Chunk pairs judged for one scanned version; the most similar come first. */
export const CONFLICT_MAX_JUDGED_PAIRS_PER_SCAN = 8;
/** A scan the judge could not finish is retried this many times, then closed. */
export const CONFLICT_MAX_SCAN_ATTEMPTS = 3;
/** Versions scanned per sweep, so a backfill cannot flood the judge. */
export const CONFLICT_SWEEP_BATCH = 20;
const RETRY_AFTER_MINUTES = 10;

export interface KnowledgeConflictScanResult {
  conflicts: number;
  isComplete: boolean;
  judged: number;
}

interface PendingScanRow {
  organizationId: string;
  versionId: string;
}

function comparePairOrder(a: string, b: string): number {
  return a < b ? -1 : 1;
}

/**
 * Finds Brand Truth sources that contradict each other (#5145: "when two
 * eligible sources conflict, show both"). When a Brand Truth version is ready
 * its chunks are compared by embedding with the nearest chunks of the other
 * eligible Brand Truth versions, and each close pair is judged once. Each
 * judged version pair is stored in id order, so a pair is never judged twice
 * and a changed source (a new version) is judged afresh.
 *
 * The scan is a pull-based sweep over the ledger of scanned versions. It never
 * runs inside the ingestion transactions, so a slow or unavailable judge
 * cannot hold up or fail an ingest.
 */
@Injectable()
export class KnowledgeConflictDetectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly judge: KnowledgeConflictJudgeService,
  ) {}

  /** Scans the versions that are ready and not yet scanned; returns how many. */
  async sweep(): Promise<{ scanned: number; failed: number }> {
    const pending = await this.prisma.$queryRaw<PendingScanRow[]>(Prisma.sql`
      SELECT v."organizationId", v."id" AS "versionId"
      FROM "knowledge_source_versions" v
      JOIN "knowledge_sources" s
        ON s."id" = v."sourceId" AND s."organizationId" = v."organizationId"
      LEFT JOIN "knowledge_conflict_scans" c
        ON c."organizationId" = v."organizationId" AND c."versionId" = v."id" AND c."isDeleted" = false
      WHERE v."isDeleted" = false AND v."isCurrent" = true
        AND v."processingState" = ${KnowledgeProcessingState.READY}::"KnowledgeProcessingState"
        AND v."retrievalState" = ${KnowledgeRetrievalState.ACTIVE}::"KnowledgeRetrievalState"
        AND v."retentionState" = ${KnowledgeRetentionState.RETAINED}::"KnowledgeRetentionState"
        AND s."isDeleted" = false AND s."isVisible" = true
        AND s."purpose" = ${KnowledgeSourcePurpose.BRAND_TRUTH}::"KnowledgeSourcePurpose"
        AND s."scope" <> 'personal'
        AND (
          c."id" IS NULL
          OR (c."isComplete" = false AND c."scannedAt" < NOW() - make_interval(mins => ${RETRY_AFTER_MINUTES}))
        )
      ORDER BY v."createdAt", v."id"
      LIMIT ${CONFLICT_SWEEP_BATCH}
    `);

    let scanned = 0;
    let failed = 0;
    for (const row of pending) {
      try {
        await this.scanVersion(row.organizationId, row.versionId);
        scanned++;
      } catch {
        failed++;
      }
    }
    return { failed, scanned };
  }

  async scanVersion(
    organizationId: string,
    versionId: string,
  ): Promise<KnowledgeConflictScanResult | null> {
    const version = await this.prisma.knowledgeSourceVersion.findFirst({
      include: { source: true },
      where: scopedWhere(organizationId, {
        id: versionId,
        isCurrent: true,
        processingState: KnowledgeProcessingState.READY,
        retentionState: KnowledgeRetentionState.RETAINED,
        retrievalState: KnowledgeRetrievalState.ACTIVE,
      }),
    });
    if (
      !version ||
      version.source.isDeleted ||
      !version.source.isVisible ||
      version.source.purpose !== KnowledgeSourcePurpose.BRAND_TRUTH
    ) {
      return null;
    }

    const query = buildConflictCandidateQuery(
      organizationId,
      version.id,
      version.sourceId,
      { brandId: version.source.brandId, scope: version.source.scope },
    );
    const rows = query
      ? await this.prisma.$queryRaw<KnowledgeConflictCandidateRow[]>(query)
      : [];

    const byOther = new Map<string, KnowledgeConflictCandidateRow[]>();
    for (const row of rows.slice(0, CONFLICT_MAX_JUDGED_PAIRS_PER_SCAN)) {
      byOther.set(row.otherVersionId, [
        ...(byOther.get(row.otherVersionId) ?? []),
        row,
      ]);
    }

    const otherVersionIds = [...byOther.keys()];
    const others = otherVersionIds.length
      ? await this.prisma.knowledgeSourceVersion.findMany({
          select: { contentHash: true, id: true, sourceId: true },
          where: scopedWhere(organizationId, { id: { in: otherVersionIds } }),
        })
      : [];
    const otherById = new Map(others.map((other) => [other.id, other]));
    const alreadyJudged = otherVersionIds.length
      ? await this.prisma.knowledgeSourceConflict.findMany({
          select: { versionAId: true, versionBId: true },
          where: scopedWhere(organizationId, {
            OR: [
              { versionAId: version.id, versionBId: { in: otherVersionIds } },
              { versionBId: version.id, versionAId: { in: otherVersionIds } },
            ],
          }),
        })
      : [];
    const judgedOthers = new Set(
      alreadyJudged.map((pair) =>
        pair.versionAId === version.id ? pair.versionBId : pair.versionAId,
      ),
    );

    let judged = 0;
    let conflicts = 0;
    let isComplete = true;
    for (const [otherVersionId, pairs] of byOther) {
      const other = otherById.get(otherVersionId);
      if (!other || judgedOthers.has(otherVersionId)) continue;

      let conflict: {
        excerptOfOther: string;
        excerptOfTarget: string;
        summary: string;
      } | null = null;
      let isPairJudged = true;
      for (const pair of pairs) {
        const targetPassage = {
          text: pair.targetContent,
          title: version.source.title,
        };
        const otherPassage = {
          text: pair.otherContent,
          title: pair.otherSourceTitle,
        };
        const verdict = await this.judge.judge(
          organizationId,
          targetPassage,
          otherPassage,
        );
        judged++;
        if (verdict.kind === 'unavailable') {
          isPairJudged = false;
          continue;
        }
        if (verdict.kind === 'conflict') {
          const found: AcceptedConflict = verdict.conflict;
          conflict = {
            excerptOfOther: found.excerptB,
            excerptOfTarget: found.excerptA,
            summary: found.summary,
          };
          break;
        }
      }
      if (!conflict && !isPairJudged) {
        isComplete = false;
        continue;
      }
      if (conflict) conflicts++;

      const isTargetFirst = comparePairOrder(version.id, other.id) < 0;
      await this.storePair(organizationId, {
        conflict,
        hashOfOther: other.contentHash,
        hashOfTarget: version.contentHash,
        isTargetFirst,
        otherSourceId: other.sourceId,
        otherVersionId: other.id,
        targetSourceId: version.sourceId,
        targetVersionId: version.id,
      });
    }

    await this.recordScan(organizationId, {
      candidateCount: rows.length,
      contentHash: version.contentHash,
      isComplete,
      sourceId: version.sourceId,
      versionId: version.id,
    });
    return { conflicts, isComplete, judged };
  }

  private async storePair(
    organizationId: string,
    input: {
      conflict: {
        excerptOfOther: string;
        excerptOfTarget: string;
        summary: string;
      } | null;
      hashOfOther: string;
      hashOfTarget: string;
      isTargetFirst: boolean;
      otherSourceId: string;
      otherVersionId: string;
      targetSourceId: string;
      targetVersionId: string;
    },
  ): Promise<void> {
    const first = input.isTargetFirst
      ? {
          excerpt: input.conflict?.excerptOfTarget,
          hash: input.hashOfTarget,
          sourceId: input.targetSourceId,
          versionId: input.targetVersionId,
        }
      : {
          excerpt: input.conflict?.excerptOfOther,
          hash: input.hashOfOther,
          sourceId: input.otherSourceId,
          versionId: input.otherVersionId,
        };
    const second = input.isTargetFirst
      ? {
          excerpt: input.conflict?.excerptOfOther,
          hash: input.hashOfOther,
          sourceId: input.otherSourceId,
          versionId: input.otherVersionId,
        }
      : {
          excerpt: input.conflict?.excerptOfTarget,
          hash: input.hashOfTarget,
          sourceId: input.targetSourceId,
          versionId: input.targetVersionId,
        };
    try {
      await this.prisma.knowledgeSourceConflict.create({
        data: {
          contentHashA: first.hash,
          contentHashB: second.hash,
          excerptA: first.excerpt ? clipConflictPassage(first.excerpt) : null,
          excerptB: second.excerpt ? clipConflictPassage(second.excerpt) : null,
          judgeModel: this.judge.modelId,
          organizationId,
          sourceAId: first.sourceId,
          sourceBId: second.sourceId,
          status: input.conflict
            ? KnowledgeConflictStatus.OPEN
            : KnowledgeConflictStatus.CLEARED,
          summary: input.conflict?.summary ?? null,
          versionAId: first.versionId,
          versionBId: second.versionId,
        },
      });
    } catch (error: unknown) {
      // A concurrent scan of the other side stored the same pair first.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  private async recordScan(
    organizationId: string,
    input: {
      candidateCount: number;
      contentHash: string;
      isComplete: boolean;
      sourceId: string;
      versionId: string;
    },
  ): Promise<void> {
    const existing = await this.prisma.knowledgeConflictScan.findFirst({
      select: { attemptCount: true, id: true },
      where: scopedWhere(organizationId, { versionId: input.versionId }),
    });
    const attemptCount = (existing?.attemptCount ?? 0) + 1;
    // A scan the judge keeps failing is closed after a few tries, not retried forever.
    const isComplete =
      input.isComplete || attemptCount >= CONFLICT_MAX_SCAN_ATTEMPTS;
    if (existing) {
      await this.prisma.knowledgeConflictScan.update({
        data: {
          attemptCount,
          candidateCount: input.candidateCount,
          contentHash: input.contentHash,
          isComplete,
          scannedAt: new Date(),
        },
        where: scopedWhere(organizationId, { id: existing.id }),
      });
      return;
    }
    await this.prisma.knowledgeConflictScan.create({
      data: {
        attemptCount,
        candidateCount: input.candidateCount,
        contentHash: input.contentHash,
        isComplete,
        organizationId,
        sourceId: input.sourceId,
        versionId: input.versionId,
      },
    });
  }
}
