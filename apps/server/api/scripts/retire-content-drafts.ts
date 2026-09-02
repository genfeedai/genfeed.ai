/**
 * Classify and migrate the retired content_drafts store into canonical Posts.
 *
 * Dry-run is the default. Pass --live to write. Stable id pagination makes the
 * job resumable, targetIdempotencyKey prevents duplicates, and source-value
 * guards prevent concurrent legacy changes from being overwritten. Reports
 * contain identifiers and dispositions only; draft content is never logged.
 */

import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { AgentArtifactReferenceService } from '@api/index';
import {
  PersistedReviewDecision,
  PostCategory,
  PostVisibility,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import {
  createPrismaPgConfig,
  POSTGRES_CA_FILE_ENV_KEYS,
} from '@libs/prisma/prisma-pg-config';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('RetireContentDrafts');
const DEFAULT_BATCH_SIZE = 100;
const CONVERTIBLE_STATUSES = new Set([
  'APPROVED',
  'DRAFT',
  'READY',
  'REJECTED',
]);

export type RetiredContentRow = {
  approvedById: string | null;
  approvedVersionPinId: string | null;
  brandId: string | null;
  brandIsDeleted: boolean | null;
  brandOrganizationId: string | null;
  brandUserId: string | null;
  confidence: number | null;
  content: string | null;
  contentRunId: string | null;
  contentRunValid: boolean;
  createdAt: Date;
  generatedBy: string | null;
  id: string;
  isDeleted: boolean;
  mediaUrls: string[];
  metadata: Prisma.JsonValue | null;
  migratedPostId: string | null;
  organizationId: string;
  ownerUserId: string | null;
  platforms: string[];
  representedPostId: string | null;
  reviewActorUserId: string | null;
  skillSlug: string | null;
  status: string;
  type: string | null;
  updatedAt: Date;
};

export type RetirementDisposition =
  | 'already_migrated'
  | 'blocked_invalid_content_run'
  | 'blocked_missing_brand'
  | 'blocked_missing_content'
  | 'blocked_missing_owner'
  | 'blocked_missing_reviewer'
  | 'blocked_published_without_target'
  | 'blocked_tenant_mismatch'
  | 'blocked_unknown_status'
  | 'convertible'
  | 'retained_deleted';

export type RetirementClassification = {
  disposition: RetirementDisposition;
  targetPostId?: string;
};

export function parseRetirementArgs(args: readonly string[]): {
  batchSize: number;
  dryRun: boolean;
} {
  const batchArg = args
    .find((arg) => arg.startsWith('--batch='))
    ?.split('=')[1];
  const parsedBatch = batchArg ? Number.parseInt(batchArg, 10) : NaN;
  return {
    batchSize:
      Number.isFinite(parsedBatch) && parsedBatch > 0
        ? parsedBatch
        : DEFAULT_BATCH_SIZE,
    dryRun: !args.includes('--live'),
  };
}

export function classifyRetiredContent(
  row: RetiredContentRow,
): RetirementClassification {
  if (row.migratedPostId) {
    return {
      disposition: 'already_migrated',
      targetPostId: row.migratedPostId,
    };
  }
  if (row.isDeleted) return { disposition: 'retained_deleted' };
  if (!row.brandId || row.brandIsDeleted !== false) {
    return { disposition: 'blocked_missing_brand' };
  }
  if (row.brandOrganizationId !== row.organizationId) {
    return { disposition: 'blocked_tenant_mismatch' };
  }
  if (!row.ownerUserId) return { disposition: 'blocked_missing_owner' };
  if (row.status === 'APPROVED' && !row.reviewActorUserId) {
    return { disposition: 'blocked_missing_reviewer' };
  }
  if (!row.contentRunValid) {
    return { disposition: 'blocked_invalid_content_run' };
  }
  if (typeof row.content !== 'string' || row.content.trim().length === 0) {
    return { disposition: 'blocked_missing_content' };
  }
  if (row.status === 'PUBLISHED') {
    return row.representedPostId
      ? {
          disposition: 'already_migrated',
          targetPostId: row.representedPostId,
        }
      : { disposition: 'blocked_published_without_target' };
  }
  if (!CONVERTIBLE_STATUSES.has(row.status)) {
    return { disposition: 'blocked_unknown_status' };
  }
  return { disposition: 'convertible' };
}

function categoryFor(row: RetiredContentRow): PostCategory {
  const type = row.type?.toLowerCase() ?? '';
  if (type.includes('video')) return PostCategory.VIDEO;
  if (type.includes('image') || row.mediaUrls.length > 0) {
    return PostCategory.IMAGE;
  }
  if (type.includes('article')) return PostCategory.ARTICLE;
  return PostCategory.TEXT;
}

function labelFor(content: string): string {
  const normalized = content.trim().replace(/\s+/g, ' ');
  return normalized.length <= 80
    ? normalized
    : `${normalized.slice(0, 79).trimEnd()}…`;
}

function reviewDecisionFor(status: string): PersistedReviewDecision | null {
  if (status === 'REJECTED') return PersistedReviewDecision.REJECTED;
  return null;
}

function rejectionReason(metadata: Prisma.JsonValue | null): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const reason = (metadata as Record<string, Prisma.JsonValue>).rejectionReason;
  return typeof reason === 'string' ? reason : null;
}

async function migrateRow(
  prisma: PrismaClient,
  row: RetiredContentRow,
): Promise<string | null> {
  const targetIdempotencyKey = `retired-content:${row.id}`;
  const platform =
    row.platforms.length === 1 ? parsePlatform(row.platforms[0]) : undefined;
  const reviewDecision = reviewDecisionFor(row.status);
  const targetSettings = JSON.stringify({
    generation: {
      confidence: row.confidence,
      generatedBy: row.generatedBy,
      metadata: row.metadata ?? {},
      platforms: row.platforms,
      skillSlug: row.skillSlug,
      type: row.type,
    },
    retiredContent: {
      approvedById: row.approvedById,
      approvedVersionPinId: row.approvedVersionPinId,
      sourceId: row.id,
      sourceStatus: row.status,
    },
  });
  const targetAttachments = JSON.stringify(row.mediaUrls);

  const inserted = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO posts (
      id, "userId", "organizationId", "brandId", platform, status,
      visibility, label, description, category, "contentRunId", "promptUsed",
      "reviewDecision", "reviewFeedback", "reviewedAt", source,
      "targetAttachments", "targetExecutionState", "targetIdempotencyKey",
      "targetSettings", "isDeleted", "createdAt", "updatedAt"
    )
    SELECT
      ${randomUUID()}, ${row.ownerUserId}, ${row.organizationId}, ${row.brandId},
      ${platform ?? null}, 'draft', ${PostVisibility.PUBLIC},
      ${labelFor(row.content ?? '')}, ${row.content}, ${categoryFor(row)}::"PostCategory",
      ${row.contentRunId}, ${row.content},
      ${reviewDecision}::"ReviewDecision", ${rejectionReason(row.metadata)},
      ${reviewDecision ? row.updatedAt : null}, ${row.generatedBy},
      ${targetAttachments}::jsonb, ${TargetExecutionState.DRAFT},
      ${targetIdempotencyKey}, ${targetSettings}::jsonb, false,
      ${row.createdAt}, ${row.updatedAt}
    FROM content_drafts AS source
    WHERE source.id = ${row.id}
      AND source.status = ${row.status}
      AND source."updatedAt" = ${row.updatedAt}
      AND source."organizationId" = ${row.organizationId}
      AND source."brandId" = ${row.brandId}
      AND source."isDeleted" = false
    ON CONFLICT ("organizationId", "targetIdempotencyKey") DO NOTHING
    RETURNING id
  `);

  const postId =
    inserted[0]?.id ??
    (
      await prisma.post.findFirst({
        select: { id: true },
        where: {
          isDeleted: false,
          organizationId: row.organizationId,
          targetIdempotencyKey,
        },
      })
    )?.id;
  return postId ?? null;
}

async function relinkHistoricalReferences(
  prisma: PrismaClient,
  row: RetiredContentRow,
  postId: string,
): Promise<boolean> {
  const conflicts = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS count
    FROM trend_remix_lineages
    WHERE "contentDraftId" = ${row.id}
      AND "organizationId" = ${row.organizationId}
      AND "postId" IS NOT NULL
      AND "postId" <> ${postId}
  `);
  if ((conflicts[0]?.count ?? 0n) > 0n) return false;

  await prisma.$executeRaw(Prisma.sql`
    UPDATE trend_remix_lineages
    SET "postId" = ${postId}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "contentDraftId" = ${row.id}
      AND "organizationId" = ${row.organizationId}
      AND ("postId" IS NULL OR "postId" = ${postId})
  `);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE content_plan_items
    SET data = (data - 'contentDraftId') || jsonb_build_object('postId', ${postId}),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "organizationId" = ${row.organizationId}
      AND jsonb_typeof(data) = 'object'
      AND data->>'contentDraftId' = ${row.id}
  `);
  return true;
}

async function preserveApprovedReview(
  prisma: PrismaClient,
  artifactReferences: AgentArtifactReferenceService,
  row: RetiredContentRow,
  postId: string,
): Promise<boolean> {
  if (row.status !== 'APPROVED' || !row.reviewActorUserId || !row.brandId) {
    return true;
  }

  return prisma.$transaction(async (transaction) => {
    const versionPin = await artifactReferences.createOrReuseVersionPin({
      createdByUserId: row.reviewActorUserId,
      reference: {
        brandId: row.brandId,
        kind: 'post',
        organizationId: row.organizationId,
        recordId: postId,
        serializer: 'post',
      },
      transaction,
    });
    const result = await transaction.post.updateMany({
      data: {
        reviewDecision: PersistedReviewDecision.APPROVED,
        reviewedAt: row.updatedAt,
        reviewVersionPinId: versionPin.id,
      },
      where: {
        brandId: row.brandId,
        id: postId,
        isDeleted: false,
        organizationId: row.organizationId,
      },
    });
    return result.count === 1;
  });
}

async function main(): Promise<void> {
  const { batchSize, dryRun } = parseRetirementArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run this retirement.');
  }

  // TLS is resolved through the same factory `PrismaService` uses rather than
  // handing the raw URL to the adapter. RDS forces SSL and pg 8.22 treats
  // `sslmode=require` as `verify-full`, so a connection string that works for
  // the deployed API fails from a laptop, which has no bundled CA at
  // `/certs/rds-ca.pem`.
  const prisma = new PrismaClient({
    adapter: new PrismaPg(
      createPrismaPgConfig(connectionString, {
        caFilePaths: POSTGRES_CA_FILE_ENV_KEYS.map((key) => process.env[key]),
      }),
    ),
    log: ['error'],
  });
  // PrismaClient structurally satisfies the service's narrowed delegate view
  // (`Pick<Prisma.TransactionClient, …> & Pick<ServerPrisma, 'agentMessage'>`),
  // so this needs no assertion — the type-assertion ratchet bans new ones.
  const artifactReferences = new AgentArtifactReferenceService(prisma);
  const counts: Record<string, number> = {};
  let blockerCount = 0;
  let rowsClassified = 0;

  try {
    let cursor = '';
    for (;;) {
      const rows = await prisma.$queryRaw<RetiredContentRow[]>(Prisma.sql`
        SELECT
          source.id,
          source."organizationId",
          source."brandId",
          source."contentRunId",
          source."approvedById",
          source."approvedVersionPinId",
          source.status,
          source.content,
          source.type,
          source."generatedBy",
          source."skillSlug",
          source.confidence,
          COALESCE(source."mediaUrls", ARRAY[]::text[]) AS "mediaUrls",
          COALESCE(source.platforms, ARRAY[]::text[]) AS platforms,
          source.metadata,
          source."isDeleted",
          source."createdAt",
          source."updatedAt",
          brand."organizationId" AS "brandOrganizationId",
          brand."isDeleted" AS "brandIsDeleted",
          brand."userId" AS "brandUserId",
          COALESCE(
            approved_member."userId",
            owner_member."userId",
            organization."userId",
            brand."userId"
          ) AS "ownerUserId",
          COALESCE(approved_member."userId", owner_member."userId", organization."userId") AS "reviewActorUserId",
          EXISTS (
            SELECT 1 FROM content_runs AS run
            WHERE run.id = source."contentRunId"
              AND run."organizationId" = source."organizationId"
              AND (run."brandId" IS NULL OR run."brandId" = source."brandId")
          ) OR source."contentRunId" IS NULL AS "contentRunValid",
          migrated.id AS "migratedPostId",
          represented.id AS "representedPostId"
        FROM content_drafts AS source
        LEFT JOIN brands AS brand ON brand.id = source."brandId"
        LEFT JOIN organizations AS organization
          ON organization.id = source."organizationId"
          AND organization."isDeleted" = false
        LEFT JOIN members AS approved_member
          ON approved_member."userId" = source."approvedById"
          AND approved_member."organizationId" = source."organizationId"
          AND approved_member."isActive" = true
          AND approved_member."isDeleted" = false
        LEFT JOIN members AS owner_member
          ON owner_member."userId" = brand."userId"
          AND owner_member."organizationId" = source."organizationId"
          AND owner_member."isActive" = true
          AND owner_member."isDeleted" = false
        LEFT JOIN posts AS migrated
          ON migrated."organizationId" = source."organizationId"
          AND migrated."targetIdempotencyKey" = 'retired-content:' || source.id
          AND migrated."isDeleted" = false
        LEFT JOIN LATERAL (
          SELECT post.id
          FROM posts AS post
          WHERE post."organizationId" = source."organizationId"
            AND post."brandId" = source."brandId"
            AND post."isDeleted" = false
            AND post.id IN (
              SELECT jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(source.metadata->'publishedPostIds') = 'array'
                    THEN source.metadata->'publishedPostIds'
                  ELSE '[]'::jsonb
                END
              )
            )
          ORDER BY post.id
          LIMIT 1
        ) AS represented ON true
        WHERE source.id > ${cursor}
        ORDER BY source.id ASC
        LIMIT ${batchSize}
      `);
      if (rows.length === 0) break;

      for (const row of rows) {
        const classification = classifyRetiredContent(row);
        let targetPostId = classification.targetPostId;
        let disposition: RetirementDisposition | 'blocked_concurrent_change' =
          classification.disposition;

        if (!dryRun && classification.disposition === 'convertible') {
          targetPostId = await migrateRow(prisma, row);
          if (!targetPostId) {
            disposition = 'blocked_concurrent_change';
          } else if (
            !(await preserveApprovedReview(
              prisma,
              artifactReferences,
              row,
              targetPostId,
            )) ||
            !(await relinkHistoricalReferences(prisma, row, targetPostId))
          ) {
            disposition = 'blocked_concurrent_change';
          }
        } else if (!dryRun && targetPostId) {
          if (
            !(await preserveApprovedReview(
              prisma,
              artifactReferences,
              row,
              targetPostId,
            )) ||
            !(await relinkHistoricalReferences(prisma, row, targetPostId))
          ) {
            disposition = 'blocked_concurrent_change';
          }
        }

        const reportRow = {
          disposition,
          id: row.id,
          organizationId: row.organizationId,
          ...(targetPostId ? { targetPostId } : {}),
        };
        counts[disposition] = (counts[disposition] ?? 0) + 1;
        rowsClassified += 1;
        if (
          disposition.startsWith('blocked_') ||
          disposition === 'retained_deleted'
        ) {
          blockerCount += 1;
        }
        process.stdout.write(`${JSON.stringify(reportRow)}\n`);
      }
      cursor = rows.at(-1)?.id ?? cursor;
    }

    process.stdout.write(
      `${JSON.stringify({ summary: { blockerCount, counts, dryRun, rowsClassified } })}\n`,
    );

    if (!dryRun && blockerCount > 0) {
      throw new Error(
        `Retirement did not converge: ${blockerCount} retained or blocked rows. Resolve the reported classifications and rerun safely.`,
      );
    }
    logger.log(
      `${dryRun ? 'Dry-run' : 'Live retirement'} complete: ${rowsClassified} rows classified.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    logger.error('Content retirement failed', error);
    process.exit(1);
  });
}
