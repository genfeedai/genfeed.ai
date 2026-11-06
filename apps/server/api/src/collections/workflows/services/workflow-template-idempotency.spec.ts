import type { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { hashTemplateInstantiationRequest } from '@api/collections/workflows/services/workflow-create-payload.util';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };
const request = (
  overrides: Partial<CreateWorkflowDto> = {},
): CreateWorkflowDto => ({
  idempotencyKey: 'attempt-1',
  label: 'First',
  templateId: 'release-loop',
  ...overrides,
});
const winner = () => ({
  id: 'winner',
  label: 'Edited after creation',
  organizationId: 'org',
  userId: 'user',
  templateInstantiationRequestHash: hashTemplateInstantiationRequest(
    'release-loop',
    'brand',
  ),
  currentVersion: {
    id: 'v2',
    version: 2,
    graph: { nodes: [], edges: [] },
    inputSchema: [],
  },
});

type WorkflowRow = Record<string, unknown>;

const stored = (overrides: WorkflowRow = {}): WorkflowRow => ({
  ...winner(),
  isDeleted: false,
  templateInstantiationKey: 'attempt-1',
  ...overrides,
});

describe('Seeded template instantiation identity', () => {
  let workflows: WorkflowRow[];
  let lookups: Record<string, unknown>[];
  let created: Record<string, unknown>[];
  let scheduled: unknown[][];
  let executed: unknown[][];
  let isBrandAuthorized: boolean;
  let service: WorkflowsService;
  beforeEach(() => {
    vi.clearAllMocks();
    workflows = [];
    lookups = [];
    created = [];
    scheduled = [];
    executed = [];
    isBrandAuthorized = true;
    const findFirst = async ({ where }: { where: Record<string, unknown> }) => {
      lookups.push(where);
      return (
        workflows.find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) ?? null
      );
    };
    service = new WorkflowsService(
      {
        brand: {
          findFirst: async () => (isBrandAuthorized ? { id: 'brand' } : null),
        },
        workflow: { findFirst },
      } as never,
      logger as never,
      {
        get: (token: unknown) =>
          token === WorkflowExecutionQueueService
            ? {
                syncWorkflowScheduler: async (...args: unknown[]) => {
                  scheduled.push(args);
                },
              }
            : undefined,
      } as never,
    );
    vi.spyOn(service, 'create').mockImplementation(async (payload) => {
      created.push(payload as unknown as Record<string, unknown>);
      return { id: 'created', nodes: [] } as never;
    });
    vi.spyOn(service, 'executeWorkflow').mockImplementation(
      async (...args: unknown[]) => {
        executed.push(args);
        return { mode: 'node' } as never;
      },
    );
  });

  it('replays current edits without a version, scheduler or execution side effect', async () => {
    workflows.push(stored());
    const result = await service.createWorkflow(
      'user',
      'org',
      request({ trigger: 'manual' as never }),
      'brand',
    );
    expect(result).toMatchObject({
      id: 'winner',
      label: 'Edited after creation',
      version: 2,
    });
    expect({ created, executed, scheduled }).toEqual({
      created: [],
      executed: [],
      scheduled: [],
    });
    expect(lookups[0]).toEqual({
      organizationId: 'org',
      userId: 'user',
      templateInstantiationKey: 'attempt-1',
      isDeleted: false,
    });
  });

  it('creates its own workflow instead of replaying another owner attempt', async () => {
    workflows.push(
      stored({ userId: 'another-user' }),
      stored({ organizationId: 'another-org' }),
    );

    await expect(
      service.createWorkflow('user', 'org', request(), 'brand'),
    ).resolves.toMatchObject({ id: 'created' });
    expect(created).toHaveLength(1);
  });

  it('puts internal identity into the atomic creation payload and only schedules the creator', async () => {
    await service.createWorkflow('user', 'org', request(), 'brand');
    expect(created).toEqual([
      expect.objectContaining({
        templateInstantiationKey: 'attempt-1',
        templateInstantiationRequestHash: hashTemplateInstantiationRequest(
          'release-loop',
          'brand',
        ),
      }),
    ]);
    expect(created[0]).not.toHaveProperty('idempotencyKey');
    expect(scheduled).toHaveLength(1);
  });

  it('recovers the concurrent winner outside the failed transaction', async () => {
    const conflict = Object.assign(new Error('unique'), { code: 'P2002' });
    vi.mocked(service.create).mockImplementation(async () => {
      // Another request committed the same attempt first.
      workflows.push(stored());
      throw conflict;
    });
    expect(
      await service.createWorkflow('user', 'org', request(), 'brand'),
    ).toMatchObject({ id: 'winner' });
    expect(scheduled).toEqual([]);
  });

  it.each(['P2002', 'P2034'])(
    'propagates %s when there is no scoped winner',
    async (code) => {
      const error = Object.assign(new Error('failure'), { code });
      vi.mocked(service.create).mockRejectedValue(error);
      await expect(
        service.createWorkflow('user', 'org', request(), 'brand'),
      ).rejects.toBe(error);
    },
  );

  it('checks brand authorization before returning an existing attempt', async () => {
    isBrandAuthorized = false;
    workflows.push(stored());
    await expect(
      service.createWorkflow('user', 'org', request(), 'brand'),
    ).rejects.toMatchObject({ status: 400 });
    expect(lookups).toEqual([]);
  });

  it('rejects a key reserved by a deleted workflow', async () => {
    workflows.push(stored({ id: 'deleted', isDeleted: true }));
    await expect(
      service.createWorkflow('user', 'org', request(), 'brand'),
    ).rejects.toMatchObject({ status: 409 });
    expect(created).toEqual([]);
  });

  it.each([
    { templateId: 'not-seeded' },
    { templateId: undefined },
    { sourceWorkflowId: 'source' },
    { sourceType: 'system-catalog' },
    { sourceType: 'featured-workflow' },
    { metadata: { sourceType: 'system-catalog' } },
    { idempotencyKey: '' },
    { idempotencyKey: ' ' },
    { idempotencyKey: 'a'.repeat(257) },
  ])('rejects incompatible keyed input %j', async (overrides) => {
    await expect(
      service.createWorkflow(
        'user',
        'org',
        request(overrides as Partial<CreateWorkflowDto>),
        'brand',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(created).toEqual([]);
  });

  it.each(['other-brand', undefined])(
    'rejects a changed effective brand %s',
    async (brand) => {
      workflows.push(stored());
      await expect(
        service.createWorkflow('user', 'org', request(), brand),
      ).rejects.toMatchObject({ status: 409 });
    },
  );

  it('rejects a changed valid seeded template', async () => {
    workflows.push(
      stored({ templateInstantiationRequestHash: 'another-template-hash' }),
    );
    await expect(
      service.createWorkflow('user', 'org', request(), 'brand'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it.each([
    'idempotencyKey',
    'templateInstantiationKey',
    'templateInstantiationRequestHash',
  ])('rejects PATCH of %s', async (field) => {
    await expect(
      service.patch('winner', { [field]: 'changed' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
