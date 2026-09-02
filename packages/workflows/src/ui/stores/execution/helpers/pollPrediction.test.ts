import type { WorkflowNode } from '@genfeedai/contracts/types';
import { describe, expect, it, vi } from 'vitest';
import type { useWorkflowStore } from '../../workflow/workflowStore';
import type { useExecutionStore } from '../executionStore';
import { pollPrediction } from './pollPrediction';

type WorkflowStoreState = ReturnType<typeof useWorkflowStore.getState>;
type ExecutionStoreState = ReturnType<typeof useExecutionStore.getState>;

interface Stores {
  executionStore: ExecutionStoreState;
  propagateOutputsDownstream: ReturnType<typeof vi.fn>;
  updateJob: ReturnType<typeof vi.fn>;
  updateNodeData: ReturnType<typeof vi.fn>;
  workflowStore: WorkflowStoreState;
}

function makeStores(workflowId: string | null = 'wf-1'): Stores {
  const updateNodeData = vi.fn();
  const propagateOutputsDownstream = vi.fn();
  const updateJob = vi.fn();

  const workflowStore = {
    getNodeById: (id: string): WorkflowNode =>
      ({
        data: {},
        id,
        position: { x: 0, y: 0 },
        type: 'imageGen',
      }) as WorkflowNode,
    propagateOutputsDownstream,
    updateNodeData,
    workflowId,
  } as unknown as WorkflowStoreState;

  const executionStore = { updateJob } as unknown as ExecutionStoreState;

  return {
    executionStore,
    propagateOutputsDownstream,
    updateJob,
    updateNodeData,
    workflowStore,
  };
}

describe('pollPrediction', () => {
  it('marks the node complete and propagates on success', async () => {
    const stores = makeStores();
    const get = vi.fn().mockResolvedValue({
      id: 'pred-1',
      output: ['https://img/out.png'],
      progress: 100,
      status: 'succeeded',
    });

    await pollPrediction(
      'pred-1',
      'node-1',
      stores.workflowStore,
      stores.executionStore,
      { get },
    );

    expect(get).toHaveBeenCalledWith(
      '/replicate/predictions/pred-1?workflowId=wf-1&nodeId=node-1',
    );
    expect(stores.updateJob).toHaveBeenCalledWith(
      'pred-1',
      expect.objectContaining({ status: 'succeeded' }),
    );
    expect(stores.updateNodeData).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        outputImage: 'https://img/out.png',
        status: 'complete',
      }),
    );
    expect(stores.propagateOutputsDownstream).toHaveBeenCalledWith('node-1');
  });

  it('omits the query string when no workflow id is set', async () => {
    const stores = makeStores(null);
    const get = vi.fn().mockResolvedValue({
      id: 'pred-1',
      output: null,
      status: 'succeeded',
    });

    await pollPrediction(
      'pred-1',
      'node-1',
      stores.workflowStore,
      stores.executionStore,
      { get },
    );

    expect(get).toHaveBeenCalledWith('/replicate/predictions/pred-1');
  });

  it('marks the node errored on failure', async () => {
    const stores = makeStores();
    const get = vi.fn().mockResolvedValue({
      error: 'GPU on fire',
      id: 'pred-1',
      output: null,
      status: 'failed',
    });

    await pollPrediction(
      'pred-1',
      'node-1',
      stores.workflowStore,
      stores.executionStore,
      { get },
    );

    expect(stores.updateNodeData).toHaveBeenCalledWith('node-1', {
      error: 'GPU on fire',
      status: 'error',
    });
    expect(stores.propagateOutputsDownstream).not.toHaveBeenCalled();
  });

  it('uses a default error message for cancellations', async () => {
    const stores = makeStores();
    const get = vi.fn().mockResolvedValue({
      id: 'pred-1',
      output: null,
      status: 'canceled',
    });

    await pollPrediction(
      'pred-1',
      'node-1',
      stores.workflowStore,
      stores.executionStore,
      { get },
    );

    expect(stores.updateNodeData).toHaveBeenCalledWith('node-1', {
      error: 'Job failed',
      status: 'error',
    });
  });

  it('keeps polling while processing, then completes', async () => {
    vi.useFakeTimers();
    try {
      const stores = makeStores();
      const get = vi
        .fn()
        .mockResolvedValueOnce({
          id: 'pred-1',
          output: null,
          progress: 40,
          status: 'processing',
        })
        .mockResolvedValueOnce({
          id: 'pred-1',
          output: 'https://img/done.png',
          progress: 100,
          status: 'succeeded',
        });

      const pending = pollPrediction(
        'pred-1',
        'node-1',
        stores.workflowStore,
        stores.executionStore,
        { get },
      );

      await vi.advanceTimersByTimeAsync(5000);
      await pending;

      expect(get).toHaveBeenCalledTimes(2);
      expect(stores.updateNodeData).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({ status: 'complete' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops silently when the signal aborts before the request', async () => {
    const stores = makeStores();
    const controller = new AbortController();
    controller.abort();
    const get = vi.fn();

    await pollPrediction(
      'pred-1',
      'node-1',
      stores.workflowStore,
      stores.executionStore,
      { get },
      controller.signal,
    );

    expect(get).not.toHaveBeenCalled();
  });

  it('stops polling when aborted during the wait', async () => {
    vi.useFakeTimers();
    try {
      const stores = makeStores();
      const controller = new AbortController();
      const get = vi.fn().mockResolvedValue({
        id: 'pred-1',
        output: null,
        status: 'processing',
      });

      const pending = pollPrediction(
        'pred-1',
        'node-1',
        stores.workflowStore,
        stores.executionStore,
        { get },
        controller.signal,
      );

      // Let the first request resolve, then abort mid-wait.
      await vi.advanceTimersByTimeAsync(1000);
      controller.abort();
      await vi.advanceTimersByTimeAsync(10_000);
      await pending;

      expect(get).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
