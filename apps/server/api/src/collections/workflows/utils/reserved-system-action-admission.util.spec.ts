import {
  buildClipAnalysisWorkflowDefinition,
  CLIP_ANALYSIS_ACTION_IDS,
} from '@api/collections/clip-projects/services/clip-analysis-workflow-definition';
import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import { assertReservedSystemActionAdmission } from '@api/collections/workflows/utils/reserved-system-action-admission.util';
import { buildWorkflowVersionDefinition } from '@api/collections/workflows/workflow-version-definition';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ExecutionContext } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const definition = buildClipAnalysisWorkflowDefinition();
  const pin = buildWorkflowVersionDefinition(definition.definition);
  const row = {
    workflowVersion: {
      id: 'version',
      workflowId: 'mirror',
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      contentHash: pin.contentHash,
      graph: pin.graph,
      inputSchema: pin.inputSchema,
      workflow: {
        isDeleted: false,
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        metadata: {
          sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
          [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
            canonicalId: definition.canonicalId,
          }),
        },
      },
    },
  };
  const prisma = {
    workflowExecution: { findFirst: vi.fn().mockResolvedValue(row) },
  };
  const context: ExecutionContext = {
    executionId: 'execution',
    workflowId: 'mirror',
    workflowVersionId: 'version',
    runId: 'run',
    organizationId: 'tenant',
    userId: 'actor',
  };
  const input = {
    context,
    nodeId: 'prepare-source',
    actionId: CLIP_ANALYSIS_ACTION_IDS.PREPARE_SOURCE,
  };
  const definitions = new Map([[definition.canonicalId, definition]]);
  return {
    row,
    prisma,
    input,
    run: () =>
      assertReservedSystemActionAdmission(
        prisma as unknown as PrismaService,
        definitions,
        input,
      ),
  };
}

describe('reserved Clip action execution authority', () => {
  it('admits only the registered graph pinned to the tenant execution and actor', async () => {
    const f = fixture();
    await f.run();
    expect(f.prisma.workflowExecution.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'execution',
          workflowId: 'mirror',
          workflowVersionId: 'version',
          organizationId: 'tenant',
          userId: 'actor',
          isDeleted: false,
        },
      }),
    );
  });
  it('rejects an unscoped or foreign execution before any action', async () => {
    const f = fixture();
    f.prisma.workflowExecution.findFirst.mockResolvedValue(null);
    await expect(f.run()).rejects.toThrow('registered execution');
  });
  it('does not authorize a copied tenant graph with genuine system metadata', async () => {
    const f = fixture();
    f.row.workflowVersion.organizationId = 'tenant';
    f.row.workflowVersion.workflow.organizationId = 'tenant';
    await expect(f.run()).rejects.toThrow('registered execution');
  });
  it('rejects a stored graph changed without changing its declared hash', async () => {
    const f = fixture();
    f.row.workflowVersion.graph = { ...f.row.workflowVersion.graph, nodes: [] };
    await expect(f.run()).rejects.toThrow('registered definition');
  });
  it('does not allow one registered action to run at another graph node', async () => {
    const f = fixture();
    f.input.nodeId = 'transcribe';
    await expect(f.run()).rejects.toThrow('registered execution');
  });
  it('rejects retired mirrors and altered version declarations', async () => {
    const f = fixture();
    f.row.workflowVersion.workflow.isDeleted = true;
    await expect(f.run()).rejects.toThrow('registered execution');
    f.row.workflowVersion.workflow.isDeleted = false;
    f.row.workflowVersion.contentHash = `sha256:v1:${'0'.repeat(64)}`;
    await expect(f.run()).rejects.toThrow('registered definition');
  });
  it('leaves ordinary tenant actions to their existing admission policy', async () => {
    const f = fixture();
    f.input.actionId = 'videoGen' as typeof f.input.actionId;
    await f.run();
    expect(f.prisma.workflowExecution.findFirst).not.toHaveBeenCalled();
  });
});
