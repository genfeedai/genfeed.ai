import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';

export interface WorkflowPollStateWrite {
  /** Platform event id to store as this node's cursor; omit to keep it. */
  lastEventId?: string;
  nodeId: string;
  organizationId: string;
  polledAt: string;
  workflowId: string;
}

/**
 * Store one social trigger node's poll state without rewriting the rest of
 * the workflow config. Replacing the whole JSON from a stale snapshot erased
 * the cursors of sibling trigger nodes (re-delivering their events) and any
 * config a user saved after the snapshot was read. Every key is set in one
 * statement, so parallel polls of different nodes serialize on the row and
 * each keeps the other's cursor. `jsonb_set` only creates the last path key,
 * so the missing `metadata` and `metadata.pollState` parents are created
 * first. The node id is bound as a parameter, never interpolated.
 */
export const writeWorkflowPollState = traced(
  'writeWorkflowPollState',
  async (
    prisma: PrismaService,
    write: WorkflowPollStateWrite,
  ): Promise<void> => {
    const { lastEventId, nodeId, organizationId, polledAt, workflowId } = write;
    const withParents = Prisma.sql`jsonb_set(
      jsonb_set(
        COALESCE("config", '{}'::jsonb),
        ARRAY['metadata']::text[],
        COALESCE("config"->'metadata', '{}'::jsonb)
      ),
      ARRAY['metadata', 'pollState']::text[],
      COALESCE("config"#>'{metadata,pollState}', '{}'::jsonb)
    )`;
    const withPolledAt = Prisma.sql`jsonb_set(
      ${withParents},
      ARRAY['metadata', 'pollState', 'lastPolledAt']::text[],
      to_jsonb(${polledAt}::text)
    )`;
    const nextConfig =
      lastEventId === undefined
        ? withPolledAt
        : Prisma.sql`jsonb_set(
      ${withPolledAt},
      ARRAY['metadata', 'pollState', ${nodeId}]::text[],
      to_jsonb(${lastEventId}::text)
    )`;

    // sql-risk-audit: ignore raw-sql-review -- Updates one row by primary key, bound to organizationId and isDeleted = false; no scan, join or aggregate.
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "workflows"
      SET "config" = ${nextConfig},
          "updatedAt" = NOW()
      WHERE "id" = ${workflowId}
        AND "organizationId" = ${organizationId}
        AND "isDeleted" = false
    `);
  },
);

export function socialTriggerJobId(
  workflowId: string,
  nodeId: string,
  eventId: string,
): string {
  // BullMQ rejects a custom job id that contains ':'.
  return ['social-trigger', workflowId, nodeId, eventId]
    .join('-')
    .replaceAll(':', '-');
}
