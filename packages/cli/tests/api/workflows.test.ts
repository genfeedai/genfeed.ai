import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkflowExecution,
  getWorkflow,
  getWorkflowExecution,
  listWorkflowExecutions,
  listWorkflows,
} from '@/api/workflows';

type SentRequest = { options: Record<string, unknown>; path: string };

// Fake API transport: records each request the CLI sends and answers with
// the queued JSON:API document.
const transport = vi.hoisted(() => ({
  response: null as unknown,
  sent: [] as SentRequest[],
}));

function respondWith(document: unknown): void {
  transport.response = document;
}

vi.mock('@/config/store', () => ({
  getApiKey: () => 'gf_test_key',
  getApiUrl: () => 'https://api.genfeed.ai/v1',
}));

vi.mock('ofetch', () => ({
  ofetch: {
    create: () => async (path: string, options: Record<string, unknown>) => {
      transport.sent.push({ options, path });
      return transport.response;
    },
  },
}));

function single(id: string, attributes: Record<string, unknown> = {}) {
  return { data: { attributes, id, type: 'workflow' } };
}

function collection(id: string, attributes: Record<string, unknown> = {}) {
  return { data: [{ attributes, id, type: 'workflow' }] };
}

describe('api/workflows', () => {
  beforeEach(() => {
    transport.sent = [];
  });

  it('lists filtered workflows with a bounded limit', async () => {
    respondWith(collection('workflow-1', { label: 'Weekly Content' }));
    const result = await listWorkflows({ limit: 500 });
    expect(transport.sent).toEqual([{ options: { method: 'GET' }, path: '/workflows?limit=100' }]);
    expect(result[0].id).toBe('workflow-1');
  });

  it('requests a later workflow page when provided', async () => {
    respondWith(collection('workflow-101'));

    await listWorkflows({ limit: 100, page: 2 });

    expect(transport.sent).toEqual([
      { options: { method: 'GET' }, path: '/workflows?limit=100&page=2' },
    ]);
  });

  it('forwards cancellation when listing workflows', async () => {
    respondWith(collection('workflow-1'));
    const controller = new AbortController();

    await listWorkflows({}, controller.signal);

    expect(transport.sent).toEqual([
      {
        options: {
          method: 'GET',
          signal: controller.signal,
        },
        path: '/workflows?limit=20',
      },
    ]);
  });

  it('gets a workflow', async () => {
    respondWith(single('workflow-1'));
    expect((await getWorkflow('workflow-1')).id).toBe('workflow-1');
  });

  it('creates a workflow execution', async () => {
    respondWith(single('execution-1', { status: 'running' }));
    const input = { inputValues: { topic: 'launch' }, workflowId: 'workflow-1' };
    expect((await createWorkflowExecution(input)).id).toBe('execution-1');
    expect(transport.sent).toEqual([
      { options: { body: input, method: 'POST' }, path: '/workflow-executions' },
    ]);
  });

  it('forwards cancellation to workflow execution creation', async () => {
    respondWith(single('execution-1', { status: 'running' }));
    const controller = new AbortController();
    const input = { workflowId: 'workflow-1' };

    await createWorkflowExecution(input, controller.signal);

    expect(transport.sent).toEqual([
      {
        options: {
          body: input,
          method: 'POST',
          signal: controller.signal,
        },
        path: '/workflow-executions',
      },
    ]);
  });

  it('lists filtered workflow executions', async () => {
    respondWith(collection('execution-1', { status: 'completed' }));
    const result = await listWorkflowExecutions({
      limit: 500,
      status: WorkflowExecutionStatus.COMPLETED,
      workflowId: 'workflow-1',
    });
    expect(transport.sent).toEqual([
      {
        options: { method: 'GET' },
        path: '/workflow-executions?limit=100&status=COMPLETED&workflowId=workflow-1',
      },
    ]);
    expect(result[0].id).toBe('execution-1');
  });

  it('gets a workflow execution', async () => {
    respondWith(single('execution-1'));
    expect((await getWorkflowExecution('execution-1')).id).toBe('execution-1');
  });
});
