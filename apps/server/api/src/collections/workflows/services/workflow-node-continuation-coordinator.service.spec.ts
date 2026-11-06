import type { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import type { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import type { WorkflowNodeClaimService } from '@api/collections/workflows/services/workflow-node-claim.service';
import type { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowNodeContinuationCoordinatorService } from '@api/collections/workflows/services/workflow-node-continuation-coordinator.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface Continuation {
  continuationId: string;
  error?: string;
  executionId: string;
  isPoison?: boolean;
  organizationId: string;
  provider: string;
  settlement?: { succeeded: boolean };
  state: 'finished' | 'pending' | 'settled';
}

describe('WorkflowNodeContinuationCoordinatorService', () => {
  let continuations: Continuation[];
  let claimedNodes: Array<Record<string, unknown>>;
  let nodeResults: Array<{
    executionId: string;
    result: Record<string, unknown>;
  }>;
  let resumed: Array<Record<string, unknown>>;
  let errors: Array<{ context: unknown; message: string }>;
  let coordinator: WorkflowNodeContinuationCoordinatorService;

  function continuation(
    id: string,
    overrides: Partial<Continuation> = {},
  ): Continuation {
    return {
      continuationId: id,
      executionId: `execution-${id}`,
      organizationId: 'org-1',
      provider: 'replicate',
      state: 'pending',
      ...overrides,
    };
  }

  beforeEach(() => {
    continuations = [];
    claimedNodes = [];
    nodeResults = [];
    resumed = [];
    errors = [];

    const find = (identity: {
      continuationId: string;
      organizationId: string;
    }) =>
      continuations.find(
        (row) =>
          row.continuationId === identity.continuationId &&
          row.organizationId === identity.organizationId,
      );

    const continuationService = {
      claimProviderSettlement: async (input: {
        identity: { continuationId: string; organizationId: string };
      }) => {
        const row = find(input.identity);
        if (row?.state !== 'settled') {
          return { kind: 'missing' };
        }
        if (row.isPoison) {
          throw new Error('poison row');
        }
        return {
          actionId: 'imageGen',
          continuationId: row.continuationId,
          creditsUsed: 5,
          error: row.error,
          executionId: row.executionId,
          finalOutput: {
            id: `ingredient-${row.continuationId}`,
            status: 'GENERATED',
          },
          ingredientId: `ingredient-${row.continuationId}`,
          kind: 'claimed',
          nodeId: 'generate',
          organizationId: row.organizationId,
          workflowVersionId: 'version-1',
        };
      },
      findReconciliationCandidates: async () =>
        continuations
          .filter((row) => row.state === 'settled')
          .map((row) => ({
            continuationId: row.continuationId,
            ...(row.error ? { error: row.error } : {}),
            organizationId: row.organizationId,
            provider: row.provider,
            succeeded: row.settlement?.succeeded ?? true,
          })),
      markSettlementFinished: async (input: {
        continuationId: string;
        organizationId: string;
      }) => {
        const row = find(input);
        if (row) {
          row.state = 'finished';
        }
      },
      reconcileHeygenPollTransport: async () => 0,
      recordProviderSettlement: async (input: {
        error?: string;
        identity: { continuationId: string; organizationId: string };
        succeeded: boolean;
      }) => {
        const row = find(input.identity);
        if (row?.state !== 'pending') {
          return 'duplicate';
        }
        row.state = 'settled';
        row.settlement = { succeeded: input.succeeded };
        if (input.error) {
          row.error = input.error;
        }
        return 'recorded';
      },
    };

    coordinator = new WorkflowNodeContinuationCoordinatorService(
      continuationService as unknown as WorkflowNodeContinuationService,
      {
        complete: async (claim: Record<string, unknown>) => {
          claimedNodes.push(claim);
        },
      } as unknown as WorkflowNodeClaimService,
      {
        updateNodeResult: async (
          executionId: string,
          result: Record<string, unknown>,
        ) => {
          nodeResults.push({ executionId, result });
        },
      } as unknown as WorkflowExecutionsService,
      {
        continueProviderCallbackExecution: async (
          input: Record<string, unknown>,
        ) => {
          resumed.push(input);
        },
      } as unknown as WorkflowExecutorService,
      {
        error: (message: string, _error: unknown, context: unknown) => {
          errors.push({ context, message });
        },
      } as unknown as LoggerService,
    );
  });

  it('persists callback settlement without holding the provider request through graph resume', async () => {
    continuations = [continuation('continuation-1')];

    await expect(
      coordinator.completeProviderAction({
        identity: { continuationId: 'continuation-1', organizationId: 'org-1' },
        provider: 'replicate',
        providerResult: { externalId: 'prediction-1' },
      }),
    ).resolves.toBe('queued');

    expect(continuations[0]?.state).toBe('settled');
    expect(resumed).toEqual([]);
  });

  it('makes a duplicate/racing callback a no-op', async () => {
    continuations = [continuation('continuation-1', { state: 'settled' })];

    await expect(
      coordinator.completeProviderAction({
        identity: { continuationId: 'continuation-1', organizationId: 'org-1' },
        provider: 'replicate',
      }),
    ).resolves.toBe('duplicate');
    expect(claimedNodes).toEqual([]);
    expect(nodeResults).toEqual([]);
  });

  it('reconciles one exact successful continuation onto its pinned execution', async () => {
    continuations = [continuation('continuation-1', { state: 'settled' })];

    await expect(coordinator.reconcileProviderContinuations()).resolves.toEqual(
      { failed: 0, pollsDispatched: 0, resumed: 1 },
    );

    expect(claimedNodes).toEqual([
      expect.objectContaining({
        executionId: 'execution-continuation-1',
        nodeId: 'generate',
        status: 'completed',
      }),
    ]);
    expect(nodeResults).toEqual([
      {
        executionId: 'execution-continuation-1',
        result: expect.objectContaining({
          creditsUsed: 5,
          status: WorkflowExecutionStatus.COMPLETED,
        }),
      },
    ]);
    expect(resumed).toEqual([
      {
        executionId: 'execution-continuation-1',
        organizationId: 'org-1',
        workflowVersionId: 'version-1',
      },
    ]);
    expect(continuations[0]?.state).toBe('finished');
  });

  it('records a failed provider result as a failed node that bills nothing', async () => {
    continuations = [continuation('continuation-1')];
    await coordinator.failProviderAction({
      error: 'provider rejected the prompt',
      identity: { continuationId: 'continuation-1', organizationId: 'org-1' },
      provider: 'replicate',
    });

    await expect(coordinator.reconcileProviderContinuations()).resolves.toEqual(
      { failed: 1, pollsDispatched: 0, resumed: 0 },
    );

    expect(nodeResults).toEqual([
      {
        executionId: 'execution-continuation-1',
        result: expect.objectContaining({
          creditsUsed: 0,
          error: 'provider rejected the prompt',
          status: WorkflowExecutionStatus.FAILED,
        }),
      },
    ]);
    expect(continuations[0]?.state).toBe('finished');
  });

  it('isolates a poison continuation and resumes later candidates', async () => {
    continuations = [
      continuation('continuation-poison', { isPoison: true, state: 'settled' }),
      continuation('continuation-healthy', { state: 'settled' }),
    ];

    await expect(coordinator.reconcileProviderContinuations()).resolves.toEqual(
      { failed: 0, pollsDispatched: 0, resumed: 1 },
    );

    expect(resumed).toEqual([
      {
        executionId: 'execution-continuation-healthy',
        organizationId: 'org-1',
        workflowVersionId: 'version-1',
      },
    ]);
    expect(errors).toEqual([
      {
        context: {
          continuationId: 'continuation-poison',
          organizationId: 'org-1',
        },
        message:
          'WorkflowNodeContinuationCoordinatorService failed to reconcile continuation',
      },
    ]);
    expect(continuations.map((row) => row.state)).toEqual([
      'settled',
      'finished',
    ]);
  });
});
