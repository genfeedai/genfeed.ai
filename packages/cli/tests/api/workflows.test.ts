import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkflowExecution,
  getWorkflow,
  getWorkflowExecution,
  listWorkflowExecutions,
  listWorkflows,
} from '@/api/workflows';

const mockFetch = vi.fn();

vi.mock('@/config/store', () => ({
  getApiKey: () => 'gf_test_key',
  getApiUrl: () => 'https://api.genfeed.ai/v1',
}));

vi.mock('ofetch', () => ({ ofetch: { create: () => mockFetch } }));

function single(id: string, attributes: Record<string, unknown> = {}) {
  return { data: { attributes, id, type: 'workflow' } };
}

function collection(id: string, attributes: Record<string, unknown> = {}) {
  return { data: [{ attributes, id, type: 'workflow' }] };
}

describe('api/workflows', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists filtered workflows with a bounded limit', async () => {
    mockFetch.mockResolvedValue(collection('workflow-1', { label: 'Weekly Content' }));
    const result = await listWorkflows({ limit: 500 });
    expect(mockFetch).toHaveBeenCalledWith('/workflows?limit=100', { method: 'GET' });
    expect(result[0].id).toBe('workflow-1');
  });

  it('requests a later workflow page when provided', async () => {
    mockFetch.mockResolvedValue(collection('workflow-101'));

    await listWorkflows({ limit: 100, page: 2 });

    expect(mockFetch).toHaveBeenCalledWith('/workflows?limit=100&page=2', { method: 'GET' });
  });

  it('forwards cancellation when listing workflows', async () => {
    mockFetch.mockResolvedValue(collection('workflow-1'));
    const controller = new AbortController();

    await listWorkflows({}, controller.signal);

    expect(mockFetch).toHaveBeenCalledWith('/workflows?limit=20', {
      method: 'GET',
      signal: controller.signal,
    });
  });

  it('gets a workflow', async () => {
    mockFetch.mockResolvedValue(single('workflow-1'));
    expect((await getWorkflow('workflow-1')).id).toBe('workflow-1');
  });

  it('creates a workflow execution', async () => {
    mockFetch.mockResolvedValue(single('execution-1', { status: 'running' }));
    const input = { inputValues: { topic: 'launch' }, workflowId: 'workflow-1' };
    expect((await createWorkflowExecution(input)).id).toBe('execution-1');
    expect(mockFetch).toHaveBeenCalledWith('/workflow-executions', { body: input, method: 'POST' });
  });

  it('forwards cancellation to workflow execution creation', async () => {
    mockFetch.mockResolvedValue(single('execution-1', { status: 'running' }));
    const controller = new AbortController();
    const input = { workflowId: 'workflow-1' };

    await createWorkflowExecution(input, controller.signal);

    expect(mockFetch).toHaveBeenCalledWith('/workflow-executions', {
      body: input,
      method: 'POST',
      signal: controller.signal,
    });
  });

  it('lists filtered workflow executions', async () => {
    mockFetch.mockResolvedValue(collection('execution-1', { status: 'completed' }));
    const result = await listWorkflowExecutions({
      limit: 500,
      status: WorkflowExecutionStatus.COMPLETED,
      workflowId: 'workflow-1',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      '/workflow-executions?limit=100&status=COMPLETED&workflowId=workflow-1',
      { method: 'GET' }
    );
    expect(result[0].id).toBe('execution-1');
  });

  it('gets a workflow execution', async () => {
    mockFetch.mockResolvedValue(single('execution-1'));
    expect((await getWorkflowExecution('execution-1')).id).toBe('execution-1');
  });
});
