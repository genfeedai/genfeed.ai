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
import { describe, expect, it, vi } from 'vitest';

const definition: SystemWorkflowGraphDefinition = {
  canonicalId: 'clip-hook-review',
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

function buildStaleMirror() {
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

function buildPrisma(options: {
  inLockMirror?: ReturnType<typeof buildStaleMirror>;
  mirror: ReturnType<typeof buildStaleMirror>;
}) {
  const transaction = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    workflow: {
      findFirst: vi
        .fn()
        .mockResolvedValue(options.inLockMirror ?? options.mirror),
      update: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...options.mirror, ...data }),
        ),
    },
  };
  const prisma = {
    $transaction: vi.fn((callback) => callback(transaction)),
    workflow: { findFirst: vi.fn().mockResolvedValue(options.mirror) },
  };
  return { prisma, transaction };
}

describe('ensureHiddenSystemWorkflowMirror', () => {
  it('writes the mirror fields once when they differ from the definition', async () => {
    const { prisma, transaction } = buildPrisma({
      mirror: buildStaleMirror(),
    });

    await ensureHiddenSystemWorkflowMirror(
      prisma as unknown as PrismaService,
      definition,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.workflow.update).toHaveBeenCalledTimes(1);
  });

  it('starts no transaction and writes nothing when the mirror is current', async () => {
    const first = buildPrisma({ mirror: buildStaleMirror() });
    const written = await ensureHiddenSystemWorkflowMirror(
      first.prisma as unknown as PrismaService,
      definition,
    );
    // What the database hands back after that write: jsonb drops `undefined`
    // members, and an unset schedule is null.
    const current = JSON.parse(
      JSON.stringify({ ...written, schedule: written.schedule ?? null }),
    );
    const { prisma, transaction } = buildPrisma({ mirror: current });

    await expect(
      ensureHiddenSystemWorkflowMirror(
        prisma as unknown as PrismaService,
        definition,
      ),
    ).resolves.toEqual(current);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transaction.workflow.update).not.toHaveBeenCalled();
  });

  it('skips the write when a run queued behind the lock finds the winner already wrote it', async () => {
    const first = buildPrisma({ mirror: buildStaleMirror() });
    const written = await ensureHiddenSystemWorkflowMirror(
      first.prisma as unknown as PrismaService,
      definition,
    );
    const current = JSON.parse(
      JSON.stringify({ ...written, schedule: written.schedule ?? null }),
    );
    const { prisma, transaction } = buildPrisma({
      inLockMirror: current,
      mirror: buildStaleMirror(),
    });

    await ensureHiddenSystemWorkflowMirror(
      prisma as unknown as PrismaService,
      definition,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.workflow.update).not.toHaveBeenCalled();
  });
});
