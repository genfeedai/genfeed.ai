import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { apiClient } from './client';
import type { ExecutionData, JobData } from './executions';
import { executionsApi } from './executions';

// Mock the apiClient
vi.mock('./client', () => ({
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

describe('executionsApi', () => {
  const mockExecution: ExecutionData = {
    _id: 'exec-123',
    createdAt: '2026-01-15T00:00:00.000Z',
    nodeResults: [],
    status: 'pending',
    totalCost: 0,
    updatedAt: '2026-01-15T00:00:00.000Z',
    workflowId: 'workflow-456',
  };

  const mockJob: JobData = {
    _id: 'job-789',
    cost: 0,
    createdAt: '2026-01-15T00:00:00.000Z',
    executionId: 'exec-123',
    nodeId: 'node-1',
    predictionId: 'pred-abc',
    progress: 0,
    status: 'pending',
    updatedAt: '2026-01-15T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('create', () => {
    it('should start a workflow execution', async () => {
      (apiClient.post as Mock).mockResolvedValueOnce({ ...mockExecution, status: 'running' });

      const result = await executionsApi.create('workflow-456');

      expect(apiClient.post).toHaveBeenCalledWith('/workflows/workflow-456/execute', undefined, {
        signal: undefined,
      });
      expect(result.workflowId).toBe('workflow-456');
      expect(result.status).toBe('running');
    });

    it('should pass abort signal', async () => {
      (apiClient.post as Mock).mockResolvedValueOnce(mockExecution);

      const controller = new AbortController();
      await executionsApi.create('workflow-456', controller.signal);

      expect(apiClient.post).toHaveBeenCalledWith('/workflows/workflow-456/execute', undefined, {
        signal: controller.signal,
      });
    });
  });

  describe('getByWorkflow', () => {
    it('should get all executions for a workflow', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce([mockExecution]);

      const result = await executionsApi.getByWorkflow('workflow-456');

      expect(apiClient.get).toHaveBeenCalledWith('/workflows/workflow-456/executions', {
        signal: undefined,
      });
      expect(result).toHaveLength(1);
      expect(result[0].workflowId).toBe('workflow-456');
    });

    it('should return empty array when no executions', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce([]);

      const result = await executionsApi.getByWorkflow('workflow-789');

      expect(result).toEqual([]);
    });
  });

  describe('getById', () => {
    it('should get a single execution by ID', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce(mockExecution);

      const result = await executionsApi.getById('exec-123');

      expect(apiClient.get).toHaveBeenCalledWith('/executions/exec-123', { signal: undefined });
      expect(result._id).toBe('exec-123');
    });
  });

  describe('stop', () => {
    it('should stop a running execution', async () => {
      (apiClient.post as Mock).mockResolvedValueOnce({ ...mockExecution, status: 'cancelled' });

      const result = await executionsApi.stop('exec-123');

      expect(apiClient.post).toHaveBeenCalledWith('/executions/exec-123/stop', undefined, {
        signal: undefined,
      });
      expect(result.status).toBe('cancelled');
    });
  });

  describe('getJobs', () => {
    it('should get all jobs for an execution', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce([mockJob]);

      const result = await executionsApi.getJobs('exec-123');

      expect(apiClient.get).toHaveBeenCalledWith('/executions/exec-123/jobs', {
        signal: undefined,
      });
      expect(result).toHaveLength(1);
      expect(result[0].executionId).toBe('exec-123');
    });
  });

  describe('getJobByPredictionId', () => {
    it('should get a job by prediction ID', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce(mockJob);

      const result = await executionsApi.getJobByPredictionId('pred-abc');

      expect(apiClient.get).toHaveBeenCalledWith('/jobs/pred-abc', { signal: undefined });
      expect(result.predictionId).toBe('pred-abc');
    });
  });
});
