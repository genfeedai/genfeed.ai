import { WorkflowGenerationAdmissionPlanService } from '@api/collections/workflows/services/workflow-generation-admission-plan.service';
import { projectWorkflowAdmissionExecutable } from '@api/collections/workflows/utils/workflow-generation-admission-source.util';
import { createInitialWorkflowNodeState } from '@api/collections/workflows/utils/workflow-initial-node-state.util';
import type { WorkflowAdmissionAvailableSourceV1 } from '@api/collections/workflows/workflow-generation-admission.interface';
import { workflowAdmissionAvailableSourceSchema } from '@api/collections/workflows/workflow-generation-admission.schema';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { ExecutableWorkflow } from '@genfeedai/workflows';
import { topologicalSort } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

function executable(
  extra?: ExecutableWorkflow['nodes'][number],
): ExecutableWorkflow {
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
      ...(extra ? [extra] : []),
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

function available(
  extra?: ExecutableWorkflow['nodes'][number],
): WorkflowAdmissionAvailableSourceV1 {
  const workflow = projectWorkflowAdmissionExecutable(executable(extra));
  const trigger = { type: 'manual', platform: 'internal', data: {} };
  const initial = createInitialWorkflowNodeState(workflow, trigger, {
    respectLocks: true,
  });
  const body = {
    version: 1 as const,
    state: 'available' as const,
    preparationVersion: 1 as const,
    requestHash: 'a'.repeat(64),
    organizationId: 'org',
    actorUserId: 'actor',
    workflowId: 'workflow',
    workflowVersionId: 'version',
    workflowVersionContentHash: `sha256:v1:${'b'.repeat(64)}`,
    brandId: 'brand',
    trigger,
    selection: { mode: 'full' as const, respectLocks: true },
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

function makeService(overrides?: { billing?: unknown; source?: unknown }) {
  const prisma = {
    workflowExecution: {
      findFirst: vi.fn().mockResolvedValue({
        generationAdmissionSource: overrides?.source ?? null,
        generationBilling: overrides?.billing ?? null,
      }),
    },
  };
  const billingPlan = {
    prepareAllocation: vi.fn().mockResolvedValue({
      allocation: { actionId: 'imageGen', nodeId: 'media' },
    }),
  };
  const generationBilling = {
    recoverPreparation: vi.fn().mockResolvedValue({}),
    prepareFunding: vi.fn().mockResolvedValue({}),
  };
  const service = new WorkflowGenerationAdmissionPlanService(
    prisma as never,
    billingPlan as never,
    generationBilling as never,
  );
  return { billingPlan, generationBilling, prisma, service };
}

describe('WorkflowGenerationAdmissionPlanService', () => {
  it('recovers an existing funded execution instead of rewriting the source', async () => {
    const { generationBilling, billingPlan, service } = makeService({
      billing: { state: 'funded' },
      source: available(),
    });

    await service.fundExecution('execution-1', 'org');

    expect(generationBilling.recoverPreparation).toHaveBeenCalledWith(
      'execution-1',
      'org',
    );
    expect(generationBilling.prepareFunding).not.toHaveBeenCalled();
    expect(billingPlan.prepareAllocation).not.toHaveBeenCalled();
  });

  it('leaves a legacy execution without source or billing unfenced', async () => {
    const { generationBilling, service } = makeService();

    await service.fundExecution('execution-1', 'org');

    expect(generationBilling.recoverPreparation).not.toHaveBeenCalled();
    expect(generationBilling.prepareFunding).not.toHaveBeenCalled();
  });

  it('compiles static imageGen allocations and skips stitch nodes', async () => {
    const source = available({
      id: 'stitch',
      type: 'genfeedAction',
      label: 'Stitch',
      config: { actionId: 'videoStitch', parameters: {} },
      inputs: [],
      isLocked: false,
      cachedOutput: undefined,
    });
    const { billingPlan, generationBilling, service } = makeService({ source });

    await service.fundExecution('execution-1', 'org');

    expect(billingPlan.prepareAllocation).toHaveBeenCalledTimes(1);
    expect(billingPlan.prepareAllocation.mock.calls[0]?.[0].node.id).toBe(
      'media',
    );
    expect(generationBilling.prepareFunding).toHaveBeenCalledWith(
      expect.objectContaining({
        allocations: [{ actionId: 'imageGen', nodeId: 'media' }],
        executionId: 'execution-1',
        organizationId: 'org',
      }),
    );
  });

  it('fails closed when every selected media node is unresolved', async () => {
    const { billingPlan, generationBilling, service } = makeService({
      source: available(),
    });
    billingPlan.prepareAllocation.mockRejectedValue(
      new BusinessLogicException('unresolved'),
    );

    await expect(service.fundExecution('execution-1', 'org')).rejects.toThrow(
      'Workflow selected media operations are unresolved',
    );
    expect(generationBilling.prepareFunding).not.toHaveBeenCalled();
  });
});
