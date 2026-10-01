import {
  assertWorkflowAdmissionRequestMatch,
  captureWorkflowGenerationAdmissionSource,
  workflowGenerationAdmissionRequestHash,
} from '@api/collections/workflows/utils/workflow-generation-admission-capture.util';
import { projectWorkflowAdmissionExecutable } from '@api/collections/workflows/utils/workflow-generation-admission-source.util';
import { createInitialWorkflowNodeState } from '@api/collections/workflows/utils/workflow-initial-node-state.util';
import type { WorkflowAdmissionAvailableSourceV1 } from '@api/collections/workflows/workflow-generation-admission.interface';
import { workflowAdmissionAvailableSourceSchema } from '@api/collections/workflows/workflow-generation-admission.schema';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import type { ExecutableWorkflow } from '@genfeedai/workflows';
import { topologicalSort } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

function executable(): ExecutableWorkflow {
  return {
    id: 'workflow',
    versionId: 'version',
    organizationId: 'org',
    userId: 'actor',
    brandId: 'brand',
    emitSharedEvents: true,
    isCustomerWorkflow: true,
    nodes: [
      {
        id: 'input',
        type: 'workflowInput',
        label: 'Input',
        config: {},
        inputs: [],
        isLocked: true,
        cachedOutput: 'owned-reference',
      },
      {
        id: 'media',
        type: 'genfeedAction',
        label: 'Image',
        config: {
          actionId: 'imageGen',
          parameters: { width: 512, height: 512 },
        },
        inputs: [],
        isLocked: false,
        cachedOutput: undefined,
      },
    ],
    edges: [
      {
        id: 'input-edge',
        source: 'input',
        target: 'media',
        sourceHandle: undefined,
        targetHandle: 'reference',
      },
    ],
    lockedNodeIds: ['input'],
  };
}

function captureInput() {
  return {
    actorUserId: 'actor',
    organizationId: 'org',
    selection: { mode: 'full' as const, respectLocks: true },
    trigger: { data: {}, platform: 'internal', type: 'manual' },
    workflowId: 'workflow',
    workflowVersionId: 'version',
  };
}

function available(): WorkflowAdmissionAvailableSourceV1 {
  const workflow = projectWorkflowAdmissionExecutable(executable());
  const input = captureInput();
  const initial = createInitialWorkflowNodeState(workflow, input.trigger, {
    respectLocks: true,
  });
  const body = {
    version: 1 as const,
    state: 'available' as const,
    preparationVersion: 1 as const,
    requestHash: workflowGenerationAdmissionRequestHash(input),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    workflowId: input.workflowId,
    workflowVersionId: input.workflowVersionId,
    workflowVersionContentHash: `sha256:v1:${'b'.repeat(64)}`,
    brandId: 'brand',
    trigger: input.trigger,
    selection: input.selection,
    workflow,
    selectedNodeIds: topologicalSort(workflow.nodes, workflow.edges),
    initialNodeOutputs: Object.fromEntries(initial.nodeCache),
    initiallyCompletedNodeIds: [...initial.completedNodes],
  };
  return workflowAdmissionAvailableSourceSchema.parse({
    ...body,
    sourceHash: quoteSnapshotHash(body),
  });
}

describe('workflow generation admission capture', () => {
  it('leaves a hidden system mirror unfunded', async () => {
    const tx = {
      workflowVersion: {
        findFirst: vi.fn().mockResolvedValue({
          contentHash: `sha256:v1:${'a'.repeat(64)}`,
          graph: {},
          id: 'version',
          inputSchema: {},
          organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          version: 1,
          workflow: {
            brandId: null,
            config: {},
            description: null,
            id: 'workflow',
            isDeleted: false,
            label: 'hidden',
            metadata: {
              sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
              systemWorkflow: buildHiddenSystemWorkflowMetadata({
                canonicalId: 'agent.turn.execute',
              }),
            },
            organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
            userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          },
        }),
      },
    };

    await expect(
      captureWorkflowGenerationAdmissionSource(
        tx as unknown as Prisma.TransactionClient,
        captureInput(),
      ),
    ).resolves.toBeNull();
  });

  it('does not retrofit a legacy null stored source on retry', () => {
    expect(() =>
      assertWorkflowAdmissionRequestMatch(null, captureInput()),
    ).not.toThrow();
  });

  it('rejects a retry whose frozen request hash changed', () => {
    const source = available();
    expect(() =>
      assertWorkflowAdmissionRequestMatch(source, {
        ...captureInput(),
        trigger: {
          data: { changed: true },
          platform: 'internal',
          type: 'manual',
        },
      }),
    ).toThrow('Workflow retry cannot replace its frozen admission request');
  });

  it('accepts a redacted retry with the same request hash', () => {
    const source = available();
    expect(() =>
      assertWorkflowAdmissionRequestMatch(
        {
          version: 1,
          state: 'redacted',
          reason: 'execution-payload-retention',
          requestHash: source.requestHash,
          sourceHash: source.sourceHash,
        },
        captureInput(),
      ),
    ).not.toThrow();
  });
});
