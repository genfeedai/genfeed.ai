import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import { ensureHiddenSystemWorkflowMirror } from '@api/collections/workflows/system-workflow-mirror.util';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { buildWorkflowVersionDefinition } from '@api/collections/workflows/workflow-version-definition';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { beforeEach, describe, expect, it } from 'vitest';

const definition: SystemWorkflowGraphDefinition = {
  canonicalId: 'clipper-hook-review',
  definition: {
    edges: [],
    nodes: [
      createGenfeedActionNode({
        actionId: 'youtube.resolve-source',
        id: 'review-hook',
      }),
    ],
  },
  description: 'Review one generated hook clip.',
  label: 'Clip Hook Review',
  resultNodeId: 'review-hook',
};

type MirrorRow = Record<string, unknown> & { id: string };

function staleMirror(): MirrorRow {
  const immutableDefinition = buildWorkflowVersionDefinition(
    definition.definition,
  );
  return {
    currentVersion: {
      contentHash: immutableDefinition.contentHash,
      graph: immutableDefinition.graph,
      id: 'global-version',
      inputSchema: immutableDefinition.inputSchema,
      version: 1,
    },
    currentVersionId: 'global-version',
    description: null,
    id: 'global-workflow',
    isDeleted: false,
    label: null,
    metadata: {
      sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
      [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
        canonicalId: definition.canonicalId,
      }),
    },
    organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
    schedule: null,
    userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
  };
}

// Postgres jsonb drops `undefined` members and an unset schedule reads as null.
const asStored = (row: MirrorRow): MirrorRow =>
  JSON.parse(JSON.stringify({ ...row, schedule: row.schedule ?? null }));

describe('ensureHiddenSystemWorkflowMirror', () => {
  // One hidden mirror row, plus what the database saw happen to it.
  let row: MirrorRow;
  let transactionsStarted: number;
  let writes: number;
  // Runs when a transaction takes the advisory lock: a competing run that
  // won the lock first can change the row here.
  let onLock: () => void;
  let prisma: PrismaService;

  beforeEach(() => {
    row = asStored(staleMirror());
    transactionsStarted = 0;
    writes = 0;
    onLock = () => {};

    const findFirst = async () => structuredClone(row);
    const transaction = {
      $executeRaw: async () => {
        onLock();
        return 1;
      },
      workflow: {
        findFirst,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          writes += 1;
          row = asStored({ ...row, ...data });
          return structuredClone(row);
        },
      },
    };
    prisma = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) => {
        transactionsStarted += 1;
        return callback(transaction);
      },
      workflow: { findFirst },
    } as unknown as PrismaService;
  });

  it('writes the definition fields onto a stale mirror once', async () => {
    await ensureHiddenSystemWorkflowMirror(prisma, definition);

    expect(writes).toBe(1);
    expect(row).toMatchObject({
      description: 'Review one generated hook clip.',
      label: 'Clip Hook Review',
      metadata: expect.objectContaining({
        sourceTemplateId: 'clipper-hook-review',
        sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
      }),
    });
  });

  it('starts no transaction and writes nothing when the mirror is current', async () => {
    await ensureHiddenSystemWorkflowMirror(prisma, definition);
    const current = structuredClone(row);
    transactionsStarted = 0;
    writes = 0;

    await expect(
      ensureHiddenSystemWorkflowMirror(prisma, definition),
    ).resolves.toEqual(current);

    expect(transactionsStarted).toBe(0);
    expect(writes).toBe(0);
  });

  it('skips the write when a run queued behind the lock finds the winner already wrote it', async () => {
    const stale = structuredClone(row);
    await ensureHiddenSystemWorkflowMirror(prisma, definition);
    const winnerRow = structuredClone(row);
    // This run read the stale row before the winner committed.
    row = stale;
    onLock = () => {
      row = structuredClone(winnerRow);
    };
    writes = 0;

    await expect(
      ensureHiddenSystemWorkflowMirror(prisma, definition),
    ).resolves.toEqual(winnerRow);

    expect(writes).toBe(0);
  });

  it('refuses to adopt a principal workflow that is not a hidden mirror', async () => {
    row = { ...row, metadata: { sourceType: 'user' } };

    await expect(
      ensureHiddenSystemWorkflowMirror(prisma, definition),
    ).rejects.toThrow(
      'System workflow clipper-hook-review collides with a non-hidden principal workflow',
    );
    expect(writes).toBe(0);
  });
});
