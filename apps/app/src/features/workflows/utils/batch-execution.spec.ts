import {
  IngredientCategory,
  IngredientStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type { ExecutionResult } from '@/features/workflows/services/workflow-api';
import {
  toBatchExecution,
  toBatchExecutionSummary,
} from '@/features/workflows/utils/batch-execution';

function execution(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    createdAt: '2026-08-29T08:00:00.000Z',
    id: 'parent-execution',
    inputValues: {
      childWorkflowId: 'workflow-1',
      childWorkflowVersionId: 'version-1',
      items: ['ingredient-1', 'ingredient-2'],
    },
    metadata: { canonicalId: 'workflow.batch.execute' },
    nodeResults: [],
    progress: 0,
    status: WorkflowExecutionStatus.RUNNING,
    trigger: 'api',
    updatedAt: '2026-08-29T08:00:01.000Z',
    workflowId: 'hidden-parent',
    ...overrides,
  };
}

describe('batch workflow execution projection', () => {
  it('projects completed and failed children from the parent for-each output', () => {
    const batch = toBatchExecution(
      execution({
        nodeResults: [
          {
            nodeId: 'execute-items',
            nodeType: 'genfeedAction',
            output: {
              count: 2,
              results: [
                {
                  index: 0,
                  provenance: {
                    executionId: 'child-1',
                    workflowId: 'workflow-1',
                    workflowLabel: 'Generate image',
                  },
                  result: {
                    id: 'output-1',
                    imageUrl: 'https://cdn.example.com/output-1.png',
                    status: IngredientStatus.GENERATED,
                  },
                },
                {
                  error: 'Provider rejected the request',
                  executionId: 'child-2',
                  index: 1,
                  status: 'failed',
                },
              ],
            },
            status: WorkflowExecutionStatus.COMPLETED,
          },
        ],
        progress: 100,
        status: WorkflowExecutionStatus.COMPLETED,
      }),
    );

    expect(batch).toMatchObject({
      completedCount: 1,
      failedCount: 1,
      items: [
        {
          executionId: 'child-1',
          outputCategory: IngredientCategory.IMAGE,
          outputIngredientId: 'output-1',
          status: WorkflowExecutionStatus.COMPLETED,
        },
        {
          error: 'Provider rejected the request',
          executionId: 'child-2',
          status: WorkflowExecutionStatus.FAILED,
        },
      ],
      workflowId: 'workflow-1',
    });
  });

  it('ignores ordinary workflow executions', () => {
    expect(
      toBatchExecution(execution({ inputValues: {}, metadata: {} })),
    ).toBeNull();
  });

  it('creates recent-list summaries from the same execution projection', () => {
    expect(toBatchExecutionSummary(execution())).toMatchObject({
      id: 'parent-execution',
      totalCount: 2,
      workflowId: 'workflow-1',
    });
  });
});
