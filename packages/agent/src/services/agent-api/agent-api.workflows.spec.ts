import { mockFetch, mockOk } from '@agent-tests/json-api-fetch.mock';
import {
  createManualReviewBatchEffect,
  getWorkflowInterfaceEffect,
  triggerWorkflowEffect,
} from '@genfeedai/agent/services/agent-api/agent-api.workflows';
import { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeApi(): AgentBaseApiService {
  return new AgentBaseApiService({
    baseUrl: 'http://api.test',
    getToken: vi.fn().mockResolvedValue('test-token'),
  });
}

describe('agent-api.workflows effects', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('getWorkflowInterfaceEffect unwraps a data payload', async () => {
    mockOk({
      data: {
        inputs: { topic: { label: 'Topic', type: 'string' } },
        outputs: {},
      },
    });

    const result = await Effect.runPromise(
      getWorkflowInterfaceEffect(makeApi(), 'wf-1'),
    );

    expect(result.inputs.topic).toMatchObject({ label: 'Topic' });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://api.test/workflows/wf-1/interface',
      expect.any(Object),
    );
  });

  it('getWorkflowInterfaceEffect falls back to bare inputs/outputs', async () => {
    mockOk({ inputs: { title: { type: 'string' } } });

    const result = await Effect.runPromise(
      getWorkflowInterfaceEffect(makeApi(), 'wf-1'),
    );

    expect(result).toEqual({
      inputs: { title: { type: 'string' } },
      outputs: {},
    });
  });

  it('getWorkflowInterfaceEffect defaults to empty schemas', async () => {
    mockOk({});

    const result = await Effect.runPromise(
      getWorkflowInterfaceEffect(makeApi(), 'wf-1'),
    );

    expect(result).toEqual({ inputs: {}, outputs: {} });
  });

  it('triggerWorkflowEffect posts input values and scope', async () => {
    mockOk({ id: 'exec-1', status: 'queued' });

    const result = await Effect.runPromise(
      triggerWorkflowEffect(makeApi(), 'wf-1', { topic: 'launch' }, undefined, {
        brandId: 'brand-1',
      }),
    );

    expect(result).toEqual({ id: 'exec-1', status: 'queued' });
    const call = mockFetch.mock.calls.at(-1);
    expect(call?.[0]).toBe('http://api.test/workflow-executions');
    expect(JSON.parse((call?.[1]?.body as string) ?? '{}')).toMatchObject({
      brandId: 'brand-1',
      inputValues: { topic: 'launch' },
      workflowId: 'wf-1',
    });
  });

  it('triggerWorkflowEffect defaults inputValues to an empty object', async () => {
    mockOk({ id: 'exec-1', status: 'queued' });

    await Effect.runPromise(triggerWorkflowEffect(makeApi(), 'wf-1'));

    const call = mockFetch.mock.calls.at(-1);
    expect(JSON.parse((call?.[1]?.body as string) ?? '{}')).toEqual({
      inputValues: {},
      workflowId: 'wf-1',
    });
  });

  it('createManualReviewBatchEffect posts the payload', async () => {
    mockOk({ id: 'batch-1', items: [{ id: 'item-1', postId: 'post-1' }] });

    const result = await Effect.runPromise(
      createManualReviewBatchEffect(makeApi(), {
        items: [],
        name: 'Review batch',
      } as never),
    );

    expect(result.id).toBe('batch-1');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://api.test/batches/manual-review',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
