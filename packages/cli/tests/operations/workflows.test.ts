import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { ApiError } from '@genfeedai/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateWorkflowExecution, mockGetWorkflow, mockListWorkflows } = vi.hoisted(() => ({
  mockCreateWorkflowExecution: vi.fn(),
  mockGetWorkflow: vi.fn(),
  mockListWorkflows: vi.fn(),
}));

vi.mock('@/api/workflows', () => ({
  createWorkflowExecution: (...args: unknown[]) => mockCreateWorkflowExecution(...args),
  getWorkflow: (...args: unknown[]) => mockGetWorkflow(...args),
  listWorkflows: (...args: unknown[]) => mockListWorkflows(...args),
}));

describe('workflow operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkflow.mockRejectedValue(new ApiError('Not found', 404));
    mockListWorkflows.mockResolvedValue([
      { id: 'workflow-1', key: 'weekly-content', label: 'Weekly Content' },
      { id: 'workflow-2', key: 'launch', label: 'Launch' },
    ]);
    mockCreateWorkflowExecution.mockResolvedValue({ id: 'execution-1' });
  });

  it('resolves an entity ID without loading the workflow collection', async () => {
    const workflow = { id: 'workflow-direct', label: 'Direct' };
    mockGetWorkflow.mockResolvedValue(workflow);
    const { resolveWorkflow } = await import('@/operations/workflows');

    await expect(resolveWorkflow(workflow.id)).resolves.toEqual(workflow);
    expect(mockGetWorkflow).toHaveBeenCalledWith(workflow.id);
    expect(mockListWorkflows).not.toHaveBeenCalled();
  });

  it('forwards cancellation through workflow resolution and execution', async () => {
    const workflow = { id: 'workflow-1', label: 'Weekly Content' };
    const controller = new AbortController();
    mockGetWorkflow.mockResolvedValue(workflow);
    const { runWorkflow } = await import('@/operations/workflows');

    await runWorkflow('workflow-1', undefined, undefined, controller.signal);

    expect(mockGetWorkflow).toHaveBeenCalledWith('workflow-1', controller.signal);
    expect(mockCreateWorkflowExecution).toHaveBeenCalledWith(
      {
        trigger: 'manual',
        workflowId: 'workflow-1',
      },
      controller.signal
    );
  });

  it.each(['workflow-1', 'weekly-content', 'WEEKLY CONTENT'])(
    'resolves and runs a unique workflow reference %s',
    async (reference) => {
      const { runWorkflow } = await import('@/operations/workflows');

      const result = await runWorkflow(
        reference,
        { topic: 'launch' },
        WorkflowExecutionTrigger.MANUAL
      );

      expect(mockCreateWorkflowExecution).toHaveBeenCalledWith({
        inputValues: { topic: 'launch' },
        trigger: 'manual',
        workflowId: 'workflow-1',
      });
      expect(result.execution.id).toBe('execution-1');
      expect(result.workflow.id).toBe('workflow-1');
    }
  );

  it('does not start an ambiguous workflow', async () => {
    mockListWorkflows.mockResolvedValue([
      { id: 'workflow-1', label: 'Campaign' },
      { id: 'workflow-2', label: 'Campaign' },
    ]);
    const { runWorkflow } = await import('@/operations/workflows');

    await expect(runWorkflow('campaign')).rejects.toThrow('matches more than one workflow');
    expect(mockCreateWorkflowExecution).not.toHaveBeenCalled();
  });

  it('resolves a workflow label beyond the first page', async () => {
    mockListWorkflows
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => ({
          id: `workflow-${index + 1}`,
          label: `Workflow ${index + 1}`,
        }))
      )
      .mockResolvedValueOnce([{ id: 'workflow-101', label: 'Deep workflow' }]);
    const { resolveWorkflow } = await import('@/operations/workflows');

    await expect(resolveWorkflow('DEEP WORKFLOW')).resolves.toEqual({
      id: 'workflow-101',
      label: 'Deep workflow',
    });
    expect(mockListWorkflows).toHaveBeenNthCalledWith(1, { limit: 100, page: 1 });
    expect(mockListWorkflows).toHaveBeenNthCalledWith(2, { limit: 100, page: 2 });
  });

  it('rejects a missing workflow and omits absent inputs', async () => {
    const { resolveWorkflow, runWorkflow } = await import('@/operations/workflows');
    await expect(resolveWorkflow('missing')).rejects.toThrow('No workflow matches');
    await runWorkflow('launch');
    expect(mockCreateWorkflowExecution).toHaveBeenCalledWith({
      trigger: 'manual',
      workflowId: 'workflow-2',
    });
  });
});
