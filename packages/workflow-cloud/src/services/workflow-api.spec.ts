import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInstance = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@genfeedai/constants', () => ({
  API_ENDPOINTS: {
    WORKFLOW_EXECUTIONS: '/workflow-executions',
    WORKFLOWS: '/workflows',
  },
}));

vi.mock('@helpers/data/json-api/json-api.helper', () => ({
  deserializeCollection: vi.fn((doc: { data: unknown[] }) => doc.data),
  deserializeResource: vi.fn((doc: { data: unknown }) => doc.data),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.example.com',
    ingredientsEndpoint: 'https://ingredients.example.com',
  },
}));

vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class HTTPBaseService {
    protected instance = mockInstance;
    protected token = 'mock-token';
    static getBaseServiceInstance<T>(
      Cls: new (...args: unknown[]) => T,
      _url: string,
      _token: string,
    ): T {
      return new Cls();
    }
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: vi.fn().mockReturnValue({
      findAll: vi.fn().mockResolvedValue([]),
    }),
  },
}));

import { createWorkflowApiService, WorkflowApiService } from './workflow-api';

describe('WorkflowApiService', () => {
  let service: WorkflowApiService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createWorkflowApiService('test-token');
  });

  describe('list', () => {
    it('should deserialize and map id/label fields', async () => {
      mockInstance.get.mockResolvedValue({
        data: {
          data: [
            { id: 'wf-1', label: 'My Workflow', updatedAt: '2026-01-01' },
            { id: 'wf-2', label: 'Other Workflow', updatedAt: '2026-01-02' },
          ],
        },
      });

      const result = await service.list();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({ _id: 'wf-1', name: 'My Workflow' }),
      );
      expect(result[1]).toEqual(
        expect.objectContaining({ _id: 'wf-2', name: 'Other Workflow' }),
      );
    });

    it('should not overwrite existing _id field', async () => {
      mockInstance.get.mockResolvedValue({
        data: {
          data: [{ _id: 'already-mapped', label: 'Test' }],
        },
      });

      const result = await service.list();

      expect(result[0]._id).toBe('already-mapped');
    });

    it('should not overwrite existing name field', async () => {
      mockInstance.get.mockResolvedValue({
        data: {
          data: [{ id: 'wf-1', label: 'Label', name: 'Existing Name' }],
        },
      });

      const result = await service.list();

      expect(result[0].name).toBe('Existing Name');
    });
  });

  describe('get', () => {
    it('should normalize workflow data with defaults', async () => {
      mockInstance.get.mockResolvedValue({
        data: {
          data: {
            createdAt: '2026-01-01',
            id: 'wf-1',
            label: 'Test Workflow',
            lifecycle: 'draft',
            organization: 'org-1',
            updatedAt: '2026-01-02',
          },
        },
      });

      const result = await service.get('wf-1');

      expect(result._id).toBe('wf-1');
      expect(result.name).toBe('Test Workflow');
      expect(result.edgeStyle).toBe('default');
      expect(result.edges).toEqual([]);
      expect(result.nodes).toEqual([]);
      expect(result.lifecycle).toBe('draft');
    });

    it('should default lifecycle to draft for invalid values', async () => {
      mockInstance.get.mockResolvedValue({
        data: {
          data: {
            id: 'wf-1',
            label: 'Test',
            lifecycle: 'invalid-lifecycle',
          },
        },
      });

      const result = await service.get('wf-1');

      expect(result.lifecycle).toBe('draft');
    });

    it('should preserve valid lifecycle values', async () => {
      for (const lifecycle of ['draft', 'published', 'archived'] as const) {
        mockInstance.get.mockResolvedValue({
          data: { data: { id: 'wf-1', label: 'Test', lifecycle } },
        });

        const result = await service.get('wf-1');

        expect(result.lifecycle).toBe(lifecycle);
      }
    });

    it('should preserve existing arrays for nodes and edges', async () => {
      const nodes = [{ id: 'n1', position: { x: 0, y: 0 }, type: 'brand' }];
      const edges = [{ id: 'e1', source: 'n1', target: 'n2' }];

      mockInstance.get.mockResolvedValue({
        data: { data: { edges, id: 'wf-1', label: 'Test', nodes } },
      });

      const result = await service.get('wf-1');

      expect(result.nodes).toEqual(nodes);
      expect(result.edges).toEqual(edges);
    });
  });

  describe('create', () => {
    it('should map name to label in the request payload', async () => {
      mockInstance.post.mockResolvedValue({
        data: {
          data: {
            edges: [],
            id: 'wf-new',
            label: 'New Workflow',
            lifecycle: 'draft',
            nodes: [],
          },
        },
      });

      await service.create({
        edges: [],
        name: 'New Workflow',
        nodes: [],
      });

      expect(mockInstance.post).toHaveBeenCalledWith('', {
        edges: [],
        label: 'New Workflow',
        nodes: [],
      });
    });
  });

  describe('update', () => {
    it('should map name to label in the update payload', async () => {
      mockInstance.patch.mockResolvedValue({
        data: {
          data: {
            edges: [],
            id: 'wf-1',
            label: 'Updated',
            lifecycle: 'draft',
            nodes: [],
          },
        },
      });

      await service.update('wf-1', { name: 'Updated' });

      expect(mockInstance.patch).toHaveBeenCalledWith('/wf-1', {
        label: 'Updated',
      });
    });

    it('should omit label from payload when name is undefined', async () => {
      mockInstance.patch.mockResolvedValue({
        data: {
          data: {
            edges: [],
            id: 'wf-1',
            label: 'Existing',
            lifecycle: 'draft',
            nodes: [],
          },
        },
      });

      await service.update('wf-1', { description: 'Updated desc' });

      expect(mockInstance.patch).toHaveBeenCalledWith('/wf-1', {
        description: 'Updated desc',
      });
    });
  });

  describe('remove', () => {
    it('should call delete on the correct path', async () => {
      mockInstance.delete.mockResolvedValue({});

      await service.remove('wf-1');

      expect(mockInstance.delete).toHaveBeenCalledWith('/wf-1');
    });
  });

  describe('execute', () => {
    it('should deserialize JSON:API response', async () => {
      mockInstance.post.mockResolvedValue({
        data: {
          data: {
            _id: 'exec-1',
            status: 'running',
            type: 'execution',
          },
        },
      });

      const result = await service.execute('wf-1', {
        inputValues: { prompt: 'test' },
      });

      expect(result._id).toBe('exec-1');
    });

    it('should return raw response when not JSON:API', async () => {
      mockInstance.post.mockResolvedValue({
        data: {
          _id: 'exec-1',
          status: 'running',
        },
      });

      const result = await service.execute('wf-1');

      expect(result._id).toBe('exec-1');
    });
  });

  describe('listExecutions', () => {
    it('should deserialize JSON:API collection response', async () => {
      mockInstance.get.mockResolvedValue({
        data: {
          data: [
            { _id: 'exec-1', status: 'completed' },
            { _id: 'exec-2', status: 'running' },
          ],
        },
      });

      const result = await service.listExecutions({ workflow: 'wf-1' });

      expect(result).toHaveLength(2);
    });

    it('should return raw array when not JSON:API', async () => {
      mockInstance.get.mockResolvedValue({
        data: [{ _id: 'exec-1', status: 'completed' }],
      });

      const result = await service.listExecutions();

      expect(result).toHaveLength(1);
    });
  });

  describe('lifecycle actions', () => {
    it('should publish a workflow', async () => {
      mockInstance.post.mockResolvedValue({
        data: {
          data: { id: 'wf-1', label: 'Test', lifecycle: 'published' },
        },
      });

      const result = await service.publish('wf-1');

      expect(mockInstance.post).toHaveBeenCalledWith('/wf-1/lifecycle/publish');
      expect(result.lifecycle).toBe('published');
    });

    it('should archive a workflow', async () => {
      mockInstance.post.mockResolvedValue({
        data: {
          data: { id: 'wf-1', label: 'Test', lifecycle: 'archived' },
        },
      });

      const result = await service.archive('wf-1');

      expect(mockInstance.post).toHaveBeenCalledWith('/wf-1/lifecycle/archive');
      expect(result.lifecycle).toBe('archived');
    });

    it('should duplicate a workflow', async () => {
      mockInstance.post.mockResolvedValue({
        data: {
          data: {
            edges: [],
            id: 'wf-copy',
            label: 'Test Copy',
            lifecycle: 'draft',
            nodes: [],
          },
        },
      });

      const result = await service.duplicate('wf-1');

      expect(mockInstance.post).toHaveBeenCalledWith('/wf-1/clone');
      expect(result._id).toBe('wf-copy');
    });
  });

  describe('webhook actions', () => {
    it('should create a webhook and unwrap the data envelope', async () => {
      mockInstance.post.mockResolvedValue({
        data: {
          data: {
            authType: 'bearer',
            lastTriggeredAt: null,
            triggerCount: 0,
            webhookId: 'webhook-1',
            webhookSecret: 'secret-1',
            webhookUrl: 'https://api.example.com/v1/webhooks/webhook-1',
          },
        },
      });

      const result = await service.createWebhook('wf-1', 'bearer');

      expect(mockInstance.post).toHaveBeenCalledWith('/wf-1/webhook', {
        authType: 'bearer',
      });
      expect(result).toEqual(
        expect.objectContaining({
          authType: 'bearer',
          webhookId: 'webhook-1',
          webhookSecret: 'secret-1',
        }),
      );
    });

    it('should fetch webhook info and unwrap the data envelope', async () => {
      mockInstance.get.mockResolvedValue({
        data: {
          data: {
            authType: 'secret',
            lastTriggeredAt: '2026-01-01T00:00:00.000Z',
            triggerCount: 3,
            webhookId: 'webhook-1',
            webhookUrl: 'https://api.example.com/v1/webhooks/webhook-1',
          },
        },
      });

      const result = await service.getWebhook('wf-1');

      expect(mockInstance.get).toHaveBeenCalledWith('/wf-1/webhook');
      expect(result).toEqual(
        expect.objectContaining({
          authType: 'secret',
          triggerCount: 3,
          webhookId: 'webhook-1',
        }),
      );
    });

    it('should regenerate a webhook secret and unwrap the data envelope', async () => {
      mockInstance.post.mockResolvedValue({
        data: {
          data: {
            webhookSecret: 'secret-2',
          },
        },
      });

      const result = await service.regenerateWebhookSecret('wf-1');

      expect(mockInstance.post).toHaveBeenCalledWith(
        '/wf-1/webhook/regenerate-secret',
      );
      expect(result).toEqual({ webhookSecret: 'secret-2' });
    });

    it('should delete a webhook configuration', async () => {
      mockInstance.delete.mockResolvedValue({});

      await service.deleteWebhook('wf-1');

      expect(mockInstance.delete).toHaveBeenCalledWith('/wf-1/webhook');
    });
  });

  describe('review gate actions', () => {
    it('should submit approval and unwrap the data envelope', async () => {
      mockInstance.post.mockResolvedValue({
        data: {
          data: {
            approvedAt: '2026-01-01T00:00:00.000Z',
            approvedBy: 'user-1',
            executionId: 'exec-1',
            nodeId: 'node-1',
            status: 'approved',
          },
        },
      });

      const result = await service.submitApproval(
        'wf-1',
        'exec-1',
        'node-1',
        true,
      );

      expect(mockInstance.post).toHaveBeenCalledWith(
        '/wf-1/executions/exec-1/approve',
        {
          approved: true,
          nodeId: 'node-1',
          rejectionReason: undefined,
        },
      );
      expect(result).toEqual({
        approvedAt: '2026-01-01T00:00:00.000Z',
        approvedBy: 'user-1',
        executionId: 'exec-1',
        nodeId: 'node-1',
        status: 'approved',
      });
    });
  });

  describe('batch operations', () => {
    it('should start a batch run', async () => {
      mockInstance.post.mockResolvedValue({
        data: { data: { batchJobId: 'batch-1', totalCount: 5 } },
      });

      const result = await service.runBatch('wf-1', [
        'ing-1',
        'ing-2',
        'ing-3',
        'ing-4',
        'ing-5',
      ]);

      expect(result.batchJobId).toBe('batch-1');
      expect(result.totalCount).toBe(5);
    });

    it('should get batch status', async () => {
      mockInstance.get.mockResolvedValue({
        data: {
          data: {
            _id: 'batch-1',
            completedCount: 2,
            failedCount: 0,
            items: [],
            status: 'processing',
            totalCount: 5,
            workflowId: 'wf-1',
          },
        },
      });

      const result = await service.getBatchStatus('batch-1');

      expect(result.status).toBe('processing');
      expect(result.completedCount).toBe(2);
    });

    it('should list batch jobs', async () => {
      mockInstance.get.mockResolvedValue({
        data: {
          data: [{ _id: 'batch-1', status: 'completed', totalCount: 5 }],
        },
      });

      const result = await service.listBatchJobs(10, 0);

      expect(result).toHaveLength(1);
      expect(mockInstance.get).toHaveBeenCalledWith('/batch', {
        params: { limit: 10, offset: 0 },
      });
    });
  });

  describe('error handling', () => {
    it('should rethrow errors from list', async () => {
      mockInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(service.list()).rejects.toThrow('Network error');
    });

    it('should rethrow errors from get', async () => {
      mockInstance.get.mockRejectedValue(new Error('Not found'));

      await expect(service.get('wf-1')).rejects.toThrow('Not found');
    });

    it('should rethrow errors from create', async () => {
      mockInstance.post.mockRejectedValue(new Error('Validation error'));

      await expect(
        service.create({ edges: [], name: 'Test', nodes: [] }),
      ).rejects.toThrow('Validation error');
    });

    it('should rethrow errors from remove', async () => {
      mockInstance.delete.mockRejectedValue(new Error('Forbidden'));

      await expect(service.remove('wf-1')).rejects.toThrow('Forbidden');
    });
  });
});
