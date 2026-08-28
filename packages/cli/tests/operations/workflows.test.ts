import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateWorkflowExecution, mockListWorkflows } = vi.hoisted(() => ({
  mockCreateWorkflowExecution: vi.fn(),
  mockListWorkflows: vi.fn(),
}));

vi.mock('../../src/api/workflows', () => ({
  createWorkflowExecution: (...args: unknown[]) => mockCreateWorkflowExecution(...args),
  listWorkflows: (...args: unknown[]) => mockListWorkflows(...args),
}));

describe('workflow operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListWorkflows.mockResolvedValue([
      { id: 'workflow-1', key: 'weekly-content', label: 'Weekly Content' },
      { id: 'workflow-2', key: 'launch', label: 'Launch' },
    ]);
    mockCreateWorkflowExecution.mockResolvedValue({ id: 'execution-1' });
  });

  it.each(['workflow-1', 'weekly-content', 'WEEKLY CONTENT'])(
    'resolves and runs a unique workflow reference %s',
    async (reference) => {
      const { runWorkflow } = await import('../../src/operations/workflows');

      const result = await runWorkflow(reference, { topic: 'launch' }, 'manual');

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
    const { runWorkflow } = await import('../../src/operations/workflows');

    await expect(runWorkflow('campaign')).rejects.toThrow('matches more than one workflow');
    expect(mockCreateWorkflowExecution).not.toHaveBeenCalled();
  });

  it('rejects a missing workflow and omits absent inputs', async () => {
    const { resolveWorkflow, runWorkflow } = await import('../../src/operations/workflows');
    await expect(resolveWorkflow('missing')).rejects.toThrow('No workflow matches');
    await runWorkflow('launch');
    expect(mockCreateWorkflowExecution).toHaveBeenCalledWith({
      trigger: 'manual',
      workflowId: 'workflow-2',
    });
  });
});
