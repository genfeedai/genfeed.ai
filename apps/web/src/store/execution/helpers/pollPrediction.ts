import { NodeStatusEnum } from '@genfeedai/types';
import { apiClient } from '@/lib/api/client';
import type { useWorkflowStore } from '@/store/workflowStore';
import type { Job, useExecutionStore } from '../executionStore';
import { getOutputUpdate } from './outputHelpers';

/**
 * Poll for prediction completion (used for individual node execution)
 * @param signal - Optional AbortSignal to cancel polling when execution is stopped
 */
export async function pollPrediction(
  predictionId: string,
  nodeId: string,
  workflowStore: ReturnType<typeof useWorkflowStore.getState>,
  executionStore: ReturnType<typeof useExecutionStore.getState>,
  signal?: AbortSignal
): Promise<void> {
  const maxAttempts = 120; // 10 minutes max
  const pollInterval = 5000; // 5 seconds
  const workflowId = workflowStore.workflowId;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Check if aborted before making request
    if (signal?.aborted) return;

    // Pass workflowId and nodeId so backend can save output to local storage
    const queryParams = workflowId ? `?workflowId=${workflowId}&nodeId=${nodeId}` : '';
    const data = await apiClient.get<{
      id: string;
      status: string;
      output: unknown;
      error?: string;
      progress?: number;
    }>(`/replicate/predictions/${predictionId}${queryParams}`);

    executionStore.updateJob(predictionId, {
      error: data.error ?? null,
      output: data.output,
      progress: data.progress ?? 0,
      status: data.status as Job['status'],
    });

    workflowStore.updateNodeData(nodeId, {
      progress: data.progress ?? 0,
    });

    if (data.status === 'succeeded') {
      const outputUpdate = getOutputUpdate(
        nodeId,
        data.output as Record<string, unknown>,
        workflowStore
      );
      // Clear error on success
      workflowStore.updateNodeData(nodeId, {
        error: undefined,
        status: NodeStatusEnum.COMPLETE,
        ...outputUpdate,
      });
      workflowStore.propagateOutputsDownstream(nodeId);
      return;
    }

    if (data.status === 'failed' || data.status === 'canceled') {
      workflowStore.updateNodeData(nodeId, {
        error: data.error ?? 'Job failed',
        status: NodeStatusEnum.ERROR,
      });
      return;
    }

    // Abortable delay - allows cancellation during wait
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, pollInterval);
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout);
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true }
        );
      }
    }).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return; // Gracefully exit on abort
      }
      throw error;
    });

    // Check again after delay
    if (signal?.aborted) return;
  }

  workflowStore.updateNodeData(nodeId, {
    error: 'Job timed out',
    status: NodeStatusEnum.ERROR,
  });
}
