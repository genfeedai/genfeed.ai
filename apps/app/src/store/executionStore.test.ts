import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExecutionStore } from './executionStore';

// Mock the workflowStore
vi.mock('./workflowStore', () => ({
  useWorkflowStore: {
    getState: vi.fn(() => ({
      edges: [],
      getConnectedInputs: vi.fn(() => new Map()),
      getNodeById: vi.fn(),
      isNodeLocked: vi.fn(() => false),
      nodes: [],
      updateNodeData: vi.fn(),
      validateWorkflow: vi.fn(() => ({ errors: [], isValid: true, warnings: [] })),
    })),
  },
}));

// Mock fetch with preconnect
const mockFetch = Object.assign(vi.fn(), { preconnect: vi.fn() }) as typeof fetch;
global.fetch = mockFetch;

describe('useExecutionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store to initial state
    useExecutionStore.setState({
      actualCost: 0,
      currentNodeId: null,
      estimatedCost: 0,
      eventSource: null,
      executionId: null,
      isRunning: false,
      jobs: new Map(),
      lastFailedNodeId: null,
      validationErrors: null,
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useExecutionStore.getState();

      expect(state.isRunning).toBe(false);
      expect(state.executionId).toBeNull();
      expect(state.currentNodeId).toBeNull();
      expect(state.validationErrors).toBeNull();
      expect(state.lastFailedNodeId).toBeNull();
      expect(state.jobs.size).toBe(0);
      expect(state.estimatedCost).toBe(0);
      expect(state.actualCost).toBe(0);
    });
  });

  describe('addJob', () => {
    it('should add a job to the jobs map', () => {
      const { addJob } = useExecutionStore.getState();

      addJob('node-1', 'prediction-123');

      const state = useExecutionStore.getState();
      expect(state.jobs.size).toBe(1);

      const job = state.jobs.get('prediction-123');
      expect(job).toBeDefined();
      expect(job?.nodeId).toBe('node-1');
      expect(job?.predictionId).toBe('prediction-123');
      expect(job?.status).toBe('pending');
      expect(job?.progress).toBe(0);
      expect(job?.output).toBeNull();
      expect(job?.error).toBeNull();
    });

    it('should add multiple jobs', () => {
      const { addJob } = useExecutionStore.getState();

      addJob('node-1', 'prediction-1');
      addJob('node-2', 'prediction-2');
      addJob('node-3', 'prediction-3');

      expect(useExecutionStore.getState().jobs.size).toBe(3);
    });
  });

  describe('updateJob', () => {
    it('should update job status', () => {
      const { addJob, updateJob } = useExecutionStore.getState();

      addJob('node-1', 'prediction-123');
      updateJob('prediction-123', { progress: 50, status: 'processing' });

      const job = useExecutionStore.getState().jobs.get('prediction-123');
      expect(job?.status).toBe('processing');
      expect(job?.progress).toBe(50);
    });

    it('should update job output', () => {
      const { addJob, updateJob } = useExecutionStore.getState();

      addJob('node-1', 'prediction-123');
      updateJob('prediction-123', {
        output: 'https://example.com/output.png',
        status: 'succeeded',
      });

      const job = useExecutionStore.getState().jobs.get('prediction-123');
      expect(job?.status).toBe('succeeded');
      expect(job?.output).toBe('https://example.com/output.png');
    });

    it('should update job error', () => {
      const { addJob, updateJob } = useExecutionStore.getState();

      addJob('node-1', 'prediction-123');
      updateJob('prediction-123', {
        error: 'API error: Rate limited',
        status: 'failed',
      });

      const job = useExecutionStore.getState().jobs.get('prediction-123');
      expect(job?.status).toBe('failed');
      expect(job?.error).toBe('API error: Rate limited');
    });

    it('should not fail for non-existent job', () => {
      const { updateJob } = useExecutionStore.getState();

      // Should not throw
      updateJob('non-existent', { status: 'processing' });

      expect(useExecutionStore.getState().jobs.size).toBe(0);
    });
  });

  describe('getJobByNodeId', () => {
    it('should return job by node ID', () => {
      const { addJob, getJobByNodeId } = useExecutionStore.getState();

      addJob('node-1', 'prediction-1');
      addJob('node-2', 'prediction-2');

      const job = getJobByNodeId('node-1');

      expect(job).toBeDefined();
      expect(job?.predictionId).toBe('prediction-1');
    });

    it('should return undefined for non-existent node', () => {
      const { addJob, getJobByNodeId } = useExecutionStore.getState();

      addJob('node-1', 'prediction-1');

      const job = getJobByNodeId('non-existent');

      expect(job).toBeUndefined();
    });
  });

  describe('stopExecution', () => {
    it('should stop execution', () => {
      useExecutionStore.setState({
        currentNodeId: 'node-2',
        executionId: 'exec-123',
        isRunning: true,
      });

      const { stopExecution } = useExecutionStore.getState();
      stopExecution();

      const state = useExecutionStore.getState();
      expect(state.isRunning).toBe(false);
      expect(state.currentNodeId).toBeNull();
    });
  });

  describe('clearValidationErrors', () => {
    it('should clear validation errors', () => {
      useExecutionStore.setState({
        validationErrors: {
          errors: [{ message: 'Error', nodeId: 'node-1', severity: 'error' }],
          isValid: false,
          warnings: [],
        },
      });

      const { clearValidationErrors } = useExecutionStore.getState();
      clearValidationErrors();

      expect(useExecutionStore.getState().validationErrors).toBeNull();
    });
  });

  describe('resetExecution', () => {
    it('should reset execution state', () => {
      useExecutionStore.setState({
        actualCost: 1.5,
        currentNodeId: 'node-3',
        executionId: 'exec-123',
        jobs: new Map([
          [
            'pred-1',
            {
              createdAt: '',
              error: null,
              nodeId: 'node-1',
              output: null,
              predictionId: 'pred-1',
              progress: 100,
              status: 'succeeded',
            },
          ],
        ]),
        lastFailedNodeId: 'node-2',
      });

      const { resetExecution } = useExecutionStore.getState();
      resetExecution();

      const state = useExecutionStore.getState();
      expect(state.jobs.size).toBe(0);
      expect(state.currentNodeId).toBeNull();
      expect(state.executionId).toBeNull();
      expect(state.actualCost).toBe(0);
      expect(state.lastFailedNodeId).toBeNull();
    });
  });

  describe('canResumeFromFailed', () => {
    it('should return true when there is a failed node and executionId', () => {
      useExecutionStore.setState({
        executionId: 'exec-123',
        isRunning: false,
        lastFailedNodeId: 'node-1',
      });

      const { canResumeFromFailed } = useExecutionStore.getState();
      expect(canResumeFromFailed()).toBe(true);
    });

    it('should return false when no failed node', () => {
      useExecutionStore.setState({
        executionId: 'exec-123',
        isRunning: false,
        lastFailedNodeId: null,
      });

      const { canResumeFromFailed } = useExecutionStore.getState();
      expect(canResumeFromFailed()).toBe(false);
    });

    it('should return false when still running', () => {
      useExecutionStore.setState({
        executionId: 'exec-123',
        isRunning: true,
        lastFailedNodeId: 'node-1',
      });

      const { canResumeFromFailed } = useExecutionStore.getState();
      expect(canResumeFromFailed()).toBe(false);
    });

    it('should return false when no executionId', () => {
      useExecutionStore.setState({
        executionId: null,
        isRunning: false,
        lastFailedNodeId: 'node-1',
      });

      const { canResumeFromFailed } = useExecutionStore.getState();
      expect(canResumeFromFailed()).toBe(false);
    });
  });

  describe('setEstimatedCost', () => {
    it('should set estimated cost', () => {
      const { setEstimatedCost } = useExecutionStore.getState();

      setEstimatedCost(2.5);

      expect(useExecutionStore.getState().estimatedCost).toBe(2.5);
    });
  });
});
