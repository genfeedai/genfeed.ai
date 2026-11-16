import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const DEFAULT_PURGE_BATCH_SIZE = 2_000;
const DEFAULT_PURGE_MAX_BATCHES = 25;

export type WorkflowExecutionPurgeResult = {
  batches: number;
  executions: number;
};

/**
 * Deletes finished runs whose `purgeAt` has passed, in bulk (#10382).
 *
 * `purgeAt` is set when a `background` run reaches a terminal state, or by the
 * backfill for runs that finished before the policy existed. One batched
 * `DELETE` replaces the per-run cleanup child workflow the artifact sweep used
 * to start for every purged row. Node results, node claims, continuations and
 * stored artifact rows leave with their run (`ON DELETE CASCADE`).
 *
 * A run stays when something still depends on it: an artifact that is not yet
 * deleted (the artifact sweep owns those), an agent audit or read-scope row
 * (`ON DELETE RESTRICT`), or a post that is still scheduled or publishing.
 */
@Traced()
@Injectable()
export class WorkflowExecutionPurgeService {
  private readonly context = 'WorkflowExecutionPurgeService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async purgeExpiredExecutions(
    options: { batchSize?: number; maxBatches?: number; now?: Date } = {},
  ): Promise<WorkflowExecutionPurgeResult> {
    const batchSize = options.batchSize ?? DEFAULT_PURGE_BATCH_SIZE;
    const maxBatches = options.maxBatches ?? DEFAULT_PURGE_MAX_BATCHES;
    const now = options.now ?? new Date();

    let executions = 0;
    let batches = 0;
    while (batches < maxBatches) {
      const deleted = await this.purgeBatch(now, batchSize);
      batches += 1;
      executions += deleted;
      if (deleted < batchSize) {
        break;
      }
    }

    this.logger.log('Purged expired workflow executions', {
      batches,
      context: this.context,
      executions,
    });
    return { batches, executions };
  }

  private async purgeBatch(now: Date, batchSize: number): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      // sql-risk-audit: ignore raw-sql-review -- fixed session timeout literal, no parameters
      await transaction.$executeRaw`SET LOCAL lock_timeout = '10s'`;
      // sql-risk-audit: ignore raw-sql-review -- fixed session timeout literal, no parameters
      await transaction.$executeRaw`SET LOCAL statement_timeout = '120s'`;
      // tenant-scope-ignore: platform purge sweeps expired runs across tenants; every row is selected by its own purgeAt, never by caller input
      // sql-risk-audit: ignore raw-sql-review -- platform-wide bulk delete bound to purgeAt, terminal status and the dependency guards below; no caller-supplied identifiers
      return transaction.$executeRaw`
        WITH due AS (
          SELECT execution."id"
          FROM "workflow_executions" AS execution
          WHERE execution."purgeAt" <= ${now}
            AND execution."isDeleted" = false
            AND execution."status" IN ('COMPLETED', 'FAILED', 'CANCELLED')
            AND NOT EXISTS (
              SELECT 1 FROM "workflow_artifacts" AS artifact
              WHERE artifact."executionId" = execution."id"
                AND artifact."state" <> 'DELETED'
            )
            AND NOT EXISTS (
              SELECT 1 FROM "agent_publish_audits" AS audit
              WHERE audit."workflowExecutionId" = execution."id"
            )
            AND NOT EXISTS (
              SELECT 1 FROM "agent_untrusted_content_audits" AS audit
              WHERE audit."workflowExecutionId" = execution."id"
            )
            AND NOT EXISTS (
              SELECT 1 FROM "workflow_execution_read_scopes" AS scope
              WHERE scope."executionId" = execution."id"
            )
            AND NOT EXISTS (
              SELECT 1 FROM "posts" AS post
              WHERE post."workflowExecutionId" = execution."id"
                AND post."targetExecutionState" IN ('scheduled', 'publishing')
            )
          ORDER BY execution."purgeAt"
          LIMIT ${batchSize}
          FOR UPDATE OF execution SKIP LOCKED
        )
        DELETE FROM "workflow_executions" AS execution
        USING due
        WHERE execution."id" = due."id"
      `;
    });
  }
}
