import { ContextEmbeddingQueueService } from '@api/collections/contexts/services/context-embedding-queue.service';
import { KnowledgeEmbeddingCompletionService } from '@api/collections/contexts/services/knowledge-embedding-completion.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ContextEmbeddingJobData } from '@genfeedai/contracts/queue';
import { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ContextEmbeddingSweepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ContextEmbeddingQueueService,
    private readonly completion: KnowledgeEmbeddingCompletionService,
  ) {}

  async sweep(): Promise<{
    due: number;
    expired: number;
    unavailable: number;
    manifests: number;
  }> {
    // Only already-admitted ledger identities enter transport recovery. The
    // independent limits prevent an outage backlog from monopolizing a sweep.
    const due = await this.prisma.$queryRaw<
      ContextEmbeddingJobData[]
    >(Prisma.sql`
      SELECT "id" AS "jobId", "organizationId", "generation"
      FROM "context_embedding_jobs"
      WHERE "isDeleted" = false AND "status" IN ('PENDING', 'RETRYABLE')
        AND "nextAttemptAt" <= clock_timestamp()
      ORDER BY "nextAttemptAt", "id" LIMIT 200
    `);
    const expired = await this.prisma.$queryRaw<
      ContextEmbeddingJobData[]
    >(Prisma.sql`
      SELECT "id" AS "jobId", "organizationId", "generation"
      FROM "context_embedding_jobs"
      WHERE "isDeleted" = false AND "status" = 'PROCESSING'
        AND "leaseExpiresAt" <= clock_timestamp()
      ORDER BY "leaseExpiresAt", "id" LIMIT 200
    `);
    const manifests = await this.prisma.$queryRaw<
      Array<{ organizationId: string; sourceId: string; versionId: string }>
    >(Prisma.sql`
      SELECT m."organizationId", m."sourceId", m."versionId" FROM "knowledge_embedding_manifests" m
      JOIN "knowledge_source_versions" v ON v."id" = m."versionId" AND v."sourceId" = m."sourceId"
        AND v."organizationId" = m."organizationId" AND v."embeddingGeneration" = m."generation" AND v."isDeleted" = false
      JOIN "knowledge_sources" s ON s."id" = m."sourceId" AND s."organizationId" = m."organizationId" AND s."isDeleted" = false
      WHERE m."isDeleted" = false AND m."finalizedAt" IS NULL AND m."failedAt" IS NULL
        AND (EXISTS (
          SELECT 1 FROM "context_embedding_jobs" j
          JOIN "context_entries" e ON e."id" = j."contextEntryId" AND e."organizationId" = j."organizationId"
          WHERE e."knowledgeEmbeddingManifestId" = m."id" AND e."isDeleted" = false
            AND j."isDeleted" = false AND j."generation" = m."generation" AND j."status" IN ('FAILED','CANCELLED')
        ) OR NOT EXISTS (
          SELECT 1 FROM "context_embedding_jobs" j
          JOIN "context_entries" e ON e."id" = j."contextEntryId" AND e."organizationId" = j."organizationId"
          WHERE e."knowledgeEmbeddingManifestId" = m."id" AND e."isDeleted" = false
            AND j."isDeleted" = false AND j."generation" = m."generation" AND j."status" IN ('PENDING','RETRYABLE','PROCESSING')
        )
        )
      ORDER BY m."sealedAt", m."id" LIMIT 200
    `);
    let unavailable = 0;
    for (const intent of [...due, ...expired]) {
      try {
        await this.queue.enqueue(intent);
      } catch {
        unavailable++;
      }
    }
    for (const manifest of manifests) {
      try {
        await this.completion.complete(
          manifest.organizationId,
          manifest.sourceId,
          manifest.versionId,
        );
      } catch {
        unavailable++;
      }
    }
    return {
      due: due.length,
      expired: expired.length,
      unavailable,
      manifests: manifests.length,
    };
  }
}
