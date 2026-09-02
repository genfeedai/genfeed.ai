import { buildSystemWorkflowMetadata } from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  brandsFindAll: vi.fn(),
  delete: vi.fn(),
  deserializeCollection: vi.fn((document: { data: unknown }) => document.data),
  deserializeResource: vi.fn((document: { data: unknown }) => document.data),
  get: vi.fn(),
  loggerError: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@genfeedai/contracts/constants', () => ({
  API_ENDPOINTS: {
    WORKFLOW_EXECUTIONS: '/workflow-executions',
    WORKFLOWS: '/workflows',
  },
}));

vi.mock('@helpers/data/json-api/json-api.helper', () => ({
  deserializeCollection: mocks.deserializeCollection,
  deserializeResource: mocks.deserializeResource,
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.test/v1',
  },
}));

vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class HTTPBaseService {
    protected instance = {
      delete: mocks.delete,
      get: mocks.get,
      patch: mocks.patch,
      post: mocks.post,
    };

    protected token: string;

    protected readonly baseURL: string;

    constructor(baseURL: string, token: string) {
      this.baseURL = baseURL;
      this.token = token;
    }

    static getBaseServiceInstance<T>(
      serviceConstructor: new (...args: unknown[]) => T,
      ...args: unknown[]
    ): T {
      return new serviceConstructor(...args);
    }
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: vi.fn(() => ({
      findAll: mocks.brandsFindAll,
    })),
  },
}));

import {
  createWorkflowApiService,
  isCanonicalSystemWorkflow,
  WorkflowApiService,
} from './workflow-api';

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workflow-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    edgeStyle: 'step',
    edges: [],
    lifecycle: 'draft',
    label: 'Launch workflow',
    nodes: [],
    organizationId: 'org-1',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function service() {
  return new WorkflowApiService('https://api.test/v1/workflows', 'token-1');
}

describe('WorkflowApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists workflows using the canonical JSON:API id and label fields', async () => {
    mocks.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            createdAt: '2026-01-01T00:00:00.000Z',
            id: 'workflow-1',
            label: 'Launch calendar',
            lifecycle: 'draft',
            metadata: {
              systemWorkflow: {
                immutable: true,
                kind: 'system-workflow',
                owner: 'genfeed',
              },
            },
            nodeCount: 3,
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      },
    });

    await expect(service().list({ lifecycle: 'draft' })).resolves.toEqual([
      expect.objectContaining({
        id: 'workflow-1',
        metadata: {
          systemWorkflow: {
            immutable: true,
            kind: 'system-workflow',
            owner: 'genfeed',
          },
        },
        label: 'Launch calendar',
      }),
    ]);
    expect(mocks.get).toHaveBeenCalledWith('', {
      params: { lifecycle: 'draft' },
    });
  });

  it('detects canonical immutable system workflow summaries', () => {
    expect(
      isCanonicalSystemWorkflow({
        metadata: {
          systemWorkflow: buildSystemWorkflowMetadata({
            canonicalId: 'daily-trends-digest',
          }),
        },
      }),
    ).toBe(true);

    expect(
      isCanonicalSystemWorkflow({
        metadata: {
          duplicatedFromSystemWorkflow: {
            canonicalId: 'daily-trends-digest',
            sourceWorkflowId: 'system-workflow-1',
          },
        },
      }),
    ).toBe(false);

    expect(
      isCanonicalSystemWorkflow({
        metadata: {
          systemWorkflow: {
            canonicalId: 'daily-trends-digest',
            immutable: true,
            kind: 'system-workflow',
            owner: 'genfeed',
          },
        },
      }),
    ).toBe(true);

    expect(
      isCanonicalSystemWorkflow({
        metadata: {
          systemWorkflow: {
            canonicalId: 'daily-trends-digest',
            immutable: true,
            kind: 'system-workflow',
            owner: 'tenant',
          },
        },
      }),
    ).toBe(false);
  });

  it('creates workflows with backend label payloads and normalizes defaults', async () => {
    mocks.post.mockResolvedValueOnce({
      data: {
        data: workflow({
          edgeStyle: null,
          edges: null,
          inputVariables: [
            {
              key: 'titleText',
              label: 'Title',
              required: true,
              type: 'text',
            },
          ],
          isScheduleEnabled: false,
          label: 'Launch workflow',
          lifecycle: 'unknown',
          nodes: null,
          schedule: '0 9 * * *',
          timezone: 'UTC',
        }),
      },
    });

    await expect(
      service().create({
        description: 'Plan launch',
        edges: [],
        inputVariables: [
          {
            key: 'titleText',
            label: 'Title',
            required: true,
            type: 'text',
          },
        ],
        isScheduleEnabled: false,
        label: 'Launch workflow',
        nodes: [],
        schedule: '0 9 * * *',
        timezone: 'UTC',
      }),
    ).resolves.toMatchObject({
      edgeStyle: 'default',
      edges: [],
      inputVariables: [
        {
          key: 'titleText',
          label: 'Title',
          required: true,
          type: 'text',
        },
      ],
      isScheduleEnabled: false,
      lifecycle: 'draft',
      label: 'Launch workflow',
      nodes: [],
      schedule: '0 9 * * *',
      timezone: 'UTC',
    });
    expect(mocks.post).toHaveBeenCalledWith('', {
      description: 'Plan launch',
      edges: [],
      inputVariables: [
        {
          key: 'titleText',
          label: 'Title',
          required: true,
          type: 'text',
        },
      ],
      isScheduleEnabled: false,
      label: 'Launch workflow',
      nodes: [],
      schedule: '0 9 * * *',
      timezone: 'UTC',
    });
  });

  it('updates workflows with canonical labels and sets thumbnails', async () => {
    mocks.patch
      .mockResolvedValueOnce({ data: { data: workflow({ label: 'Updated' }) } })
      .mockResolvedValueOnce({
        data: { data: workflow({ thumbnail: 'x.png' }) },
      });

    await service().update('workflow-1', {
      description: 'Updated description',
      inputVariables: [
        {
          defaultValue: 'Launch title',
          key: 'titleText',
          label: 'Title',
          required: true,
          type: 'text',
        },
      ],
      label: 'Updated',
    });
    await service().setThumbnail('workflow-1', 'x.png', 'node-1');

    expect(mocks.patch).toHaveBeenNthCalledWith(1, '/workflow-1', {
      description: 'Updated description',
      inputVariables: [
        {
          defaultValue: 'Launch title',
          key: 'titleText',
          label: 'Title',
          required: true,
          type: 'text',
        },
      ],
      label: 'Updated',
    });
    expect(mocks.patch).toHaveBeenNthCalledWith(2, '/workflow-1', {
      thumbnail: 'x.png',
      thumbnailNodeId: 'node-1',
    });
  });

  it('calls lifecycle, duplicate, and delete endpoints', async () => {
    mocks.patch.mockResolvedValue({ data: { data: workflow() } });
    mocks.post.mockResolvedValue({ data: { data: workflow() } });
    mocks.delete.mockResolvedValueOnce({ data: undefined });

    await service().publish('workflow-1');
    await service().archive('workflow-1');
    await service().duplicate('workflow-1');
    await service().remove('workflow-1');

    expect(mocks.patch).toHaveBeenNthCalledWith(1, '/workflow-1', {
      lifecycle: 'published',
    });
    expect(mocks.patch).toHaveBeenNthCalledWith(2, '/workflow-1', {
      lifecycle: 'archived',
    });
    expect(mocks.post).toHaveBeenCalledWith('', {
      sourceWorkflowId: 'workflow-1',
    });
    expect(mocks.delete).toHaveBeenCalledWith('/workflow-1');
  });

  it('duplicates a workflow for a target brand', async () => {
    mocks.post.mockResolvedValue({
      data: { data: workflow({ brandId: 'brand-2' }) },
    });

    await service().duplicate('workflow-1', { brandId: 'brand-2' });

    expect(mocks.post).toHaveBeenCalledWith('', {
      brandId: 'brand-2',
      sourceWorkflowId: 'workflow-1',
    });
  });

  it('uses execution endpoints and supports raw and JSON:API responses', async () => {
    const execution = {
      id: 'execution-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      nodeResults: [],
      progress: 0,
      status: 'queued',
      trigger: 'manual',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workflowId: 'workflow-1',
    };
    mocks.post
      .mockResolvedValueOnce({
        data: { data: { type: 'execution', ...execution } },
      })
      .mockResolvedValueOnce({ data: execution })
      .mockResolvedValueOnce({ data: execution });
    mocks.get
      .mockResolvedValueOnce({ data: { data: [execution] } })
      .mockResolvedValueOnce({ data: execution });

    await expect(service().execute('workflow-1')).resolves.toMatchObject({
      id: 'execution-1',
    });
    await expect(
      service().execute('workflow-1', {
        expectedContextVersion: 4,
        inputValues: { topic: 'launch' },
        metadata: { source: 'test' },
        threadId: 'thread-1',
      }),
    ).resolves.toMatchObject({ id: 'execution-1' });
    await expect(
      service().executePartial('workflow-1', ['node-1']),
    ).resolves.toMatchObject({ id: 'execution-1' });
    await expect(
      service().listExecutions({ workflowId: 'workflow-1' }),
    ).resolves.toEqual([execution]);
    await expect(service().getExecution('execution-1')).resolves.toMatchObject({
      id: 'execution-1',
    });

    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
      'https://api.test/v1/workflow-executions',
      {
        inputValues: {},
        metadata: undefined,
        workflowId: 'workflow-1',
      },
    );
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      'https://api.test/v1/workflow-executions',
      {
        expectedContextVersion: 4,
        inputValues: { topic: 'launch' },
        metadata: { source: 'test' },
        threadId: 'thread-1',
        workflowId: 'workflow-1',
      },
    );
    expect(mocks.post).toHaveBeenNthCalledWith(
      3,
      '/workflow-1/execute/partial',
      { nodeIds: ['node-1'] },
    );
    expect(mocks.get).toHaveBeenNthCalledWith(
      1,
      'https://api.test/v1/workflow-executions',
      {
        params: { workflowId: 'workflow-1' },
      },
    );
    expect(mocks.get).toHaveBeenNthCalledWith(
      2,
      'https://api.test/v1/workflow-executions/execution-1',
    );
  });

  it('resumes a failed execution with connected thread authority', async () => {
    mocks.post.mockResolvedValueOnce({
      data: {
        data: {
          message: 'Partial execution started',
          runId: 'execution-2',
          status: 'pending',
        },
      },
    });

    await expect(
      service().resumeExecution('workflow-1', 'execution-1', {
        expectedContextVersion: 4,
        threadId: 'thread-1',
      }),
    ).resolves.toMatchObject({ runId: 'execution-2' });

    expect(mocks.post).toHaveBeenCalledWith(
      '/workflow-1/execute/resume/execution-1',
      { expectedContextVersion: 4, threadId: 'thread-1' },
    );
  });

  it('normalizes webhook, approval, template, brand, and batch execution responses', async () => {
    mocks.post
      .mockResolvedValueOnce({
        data: {
          data: {
            authType: 'secret',
            lastTriggeredAt: '2026-01-01T00:00:00.000Z',
            triggerCount: 1,
            webhookId: 'webhook-1',
            webhookUrl: 'https://hooks.test/workflow-1',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            approvedAt: '2026-01-01T00:00:00.000Z',
            executionId: 'execution-1',
            nodeId: 'review-1',
            status: 'approved',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            createdAt: '2026-08-29T08:00:00.000Z',
            id: 'batch-execution-1',
            nodeResults: [],
            progress: 100,
            status: 'COMPLETED',
            trigger: 'api',
            // The batch controller serializes through `serializeSingle`, so the
            // wire shape is a JSON:API resource document, not a bare envelope.
            type: 'execution',
            updatedAt: '2026-08-29T08:01:00.000Z',
            workflowId: 'hidden-batch-workflow',
          },
        },
      });
    mocks.patch.mockResolvedValueOnce({
      data: { data: { webhookSecret: 'secret-2' } },
    });
    mocks.get
      .mockResolvedValueOnce({
        data: {
          data: {
            authType: 'none',
            lastTriggeredAt: null,
            triggerCount: 0,
            webhookId: null,
            webhookUrl: null,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'template-1',
              routine: {
                kind: 'productized-daily-routine',
                trackingTasks: [{ key: 'review-trend-brief' }],
              },
            },
          ],
        },
      });
    mocks.delete.mockResolvedValueOnce({ data: undefined });
    mocks.brandsFindAll.mockResolvedValueOnce([
      { id: 123, label: null, logoUrl: 'logo.png', slug: null },
    ]);

    await expect(service().createWebhook('workflow-1')).resolves.toMatchObject({
      lastTriggeredAt: '2026-01-01T00:00:00.000Z',
      webhookId: 'webhook-1',
    });
    await expect(service().getWebhook('workflow-1')).resolves.toMatchObject({
      lastTriggeredAt: null,
    });
    await expect(
      service().regenerateWebhookSecret('workflow-1'),
    ).resolves.toEqual({ webhookSecret: 'secret-2' });
    expect(mocks.patch).toHaveBeenCalledWith('/workflow-1/webhook', {
      rotateSecret: true,
    });
    await service().deleteWebhook('workflow-1');
    await expect(
      service().submitApproval(
        'workflow-1',
        'execution-1',
        'review-1',
        true,
        undefined,
        { expectedContextVersion: 4, threadId: 'thread-1' },
      ),
    ).resolves.toMatchObject({ status: 'approved' });
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      '/workflow-1/executions/execution-1/approve',
      {
        approved: true,
        expectedContextVersion: 4,
        nodeId: 'review-1',
        rejectionReason: undefined,
        threadId: 'thread-1',
      },
    );
    await expect(service().listTemplates()).resolves.toEqual([
      {
        id: 'template-1',
        routine: {
          kind: 'productized-daily-routine',
          trackingTasks: [{ key: 'review-trend-brief' }],
        },
      },
    ]);
    await expect(service().listBrands()).resolves.toEqual([
      {
        id: '123',
        label: 'Untitled Brand',
        logoUrl: 'logo.png',
        primaryColor: undefined,
        slug: '',
      },
    ]);
    await expect(
      service().startBatchExecution('workflow-1', ['ingredient-1']),
    ).resolves.toMatchObject({
      id: 'batch-execution-1',
    });
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/workflow-1/executions/batch',
      { ingredientIds: ['ingredient-1'] },
    );
  });

  it('lists system catalog entries from the plain (non-JSON:API) payload and preserves install state', async () => {
    // GET /workflows?source=system-catalog returns `{ data: Entry[] }` where
    // each entry already has installed / installedWorkflowId at the top level
    // — not under JSON:API `attributes` (#2259).
    mocks.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            canonicalId: 'daily-trends-digest',
            category: 'product',
            changeSummary: 'Daily digest',
            description: 'Trends digest',
            family: 'product',
            installable: true,
            installed: true,
            installedWorkflowId: 'wf-installed-1',
            isScheduleEnabled: true,
            label: 'Daily Trends Digest',
            schedule: '0 7 * * *',
            sourceIssue: 1011,
            version: 1,
          },
          {
            canonicalId: 'ad-optimization',
            category: 'ads',
            changeSummary: 'Ads',
            description: 'Ad optimizer',
            family: 'ads',
            installable: true,
            installed: false,
            installedWorkflowId: null,
            isScheduleEnabled: false,
            label: 'Ad Optimization',
            sourceIssue: 1011,
            version: 1,
          },
          // Malformed / incomplete entries are dropped rather than poisoning
          // the list with empty canonical ids.
          { installed: true },
        ],
      },
    });

    await expect(service().listSystemCatalog()).resolves.toEqual([
      {
        canonicalId: 'daily-trends-digest',
        category: 'product',
        changeSummary: 'Daily digest',
        description: 'Trends digest',
        family: 'product',
        installable: true,
        installed: true,
        installedWorkflowId: 'wf-installed-1',
        isScheduleEnabled: true,
        label: 'Daily Trends Digest',
        schedule: '0 7 * * *',
        sourceIssue: 1011,
        version: 1,
      },
      {
        canonicalId: 'ad-optimization',
        category: 'ads',
        changeSummary: 'Ads',
        description: 'Ad optimizer',
        family: 'ads',
        installable: true,
        installed: false,
        installedWorkflowId: null,
        isScheduleEnabled: false,
        label: 'Ad Optimization',
        sourceIssue: 1011,
        version: 1,
      },
    ]);
    expect(mocks.get).toHaveBeenCalledWith('', {
      params: { source: 'system-catalog' },
    });
    // Must not go through the JSON:API collection deserializer.
    expect(mocks.deserializeCollection).not.toHaveBeenCalled();
  });

  it('creates service instances with the canonical workflows endpoint', () => {
    const instance = createWorkflowApiService('token-1');

    expect(instance).toBeInstanceOf(WorkflowApiService);
  });

  it('logs and rethrows API errors with operation context', async () => {
    const error = new Error('request failed');
    mocks.get.mockRejectedValueOnce(error);

    await expect(service().get('workflow-1')).rejects.toThrow('request failed');
    expect(mocks.loggerError).toHaveBeenCalledWith('Failed to get workflow', {
      error,
      workflowId: 'workflow-1',
    });
  });

  it('logs and rethrows failures from guarded API operations', async () => {
    const guardedOperations: Array<{
      call: () => Promise<unknown>;
      rejectWith: typeof mocks.get;
    }> = [
      {
        call: () => service().list(),
        rejectWith: mocks.get,
      },
      {
        call: () =>
          service().create({
            edges: [],
            label: 'Workflow',
            nodes: [],
          }),
        rejectWith: mocks.post,
      },
      {
        call: () => service().update('workflow-1', { label: 'Workflow' }),
        rejectWith: mocks.patch,
      },
      {
        call: () => service().setThumbnail('workflow-1', 'x.png', 'node-1'),
        rejectWith: mocks.patch,
      },
      {
        call: () => service().remove('workflow-1'),
        rejectWith: mocks.delete,
      },
      {
        call: () => service().publish('workflow-1'),
        rejectWith: mocks.patch,
      },
      {
        call: () => service().archive('workflow-1'),
        rejectWith: mocks.patch,
      },
      {
        call: () => service().duplicate('workflow-1'),
        rejectWith: mocks.post,
      },
      {
        call: () => service().execute('workflow-1'),
        rejectWith: mocks.post,
      },
      {
        call: () => service().listExecutions(),
        rejectWith: mocks.get,
      },
      {
        call: () => service().getExecution('execution-1'),
        rejectWith: mocks.get,
      },
      {
        call: () => service().createWebhook('workflow-1'),
        rejectWith: mocks.post,
      },
      {
        call: () => service().getWebhook('workflow-1'),
        rejectWith: mocks.get,
      },
      {
        call: () => service().regenerateWebhookSecret('workflow-1'),
        rejectWith: mocks.patch,
      },
      {
        call: () => service().deleteWebhook('workflow-1'),
        rejectWith: mocks.delete,
      },
      {
        call: () => service().executePartial('workflow-1', ['node-1']),
        rejectWith: mocks.post,
      },
      {
        call: () =>
          service().submitApproval(
            'workflow-1',
            'execution-1',
            'node-1',
            false,
          ),
        rejectWith: mocks.post,
      },
      {
        call: () => service().listTemplates(),
        rejectWith: mocks.get,
      },
      {
        call: () => service().listBrands(),
        rejectWith: mocks.brandsFindAll,
      },
    ];

    for (const [index, operation] of guardedOperations.entries()) {
      const error = new Error(`request failed ${index}`);
      operation.rejectWith.mockRejectedValueOnce(error);

      await expect(operation.call()).rejects.toBe(error);
    }

    expect(mocks.loggerError).toHaveBeenCalledTimes(guardedOperations.length);
  });
});
