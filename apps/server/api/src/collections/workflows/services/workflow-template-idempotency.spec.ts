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

describe('Seeded template instantiation identity', () => {
  const findFirst = vi.fn();
  const brandFindFirst = vi.fn();
  const syncWorkflowScheduler = vi.fn();
  let service: WorkflowsService;
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(null);
    brandFindFirst.mockResolvedValue({ id: 'brand' });
    service = new WorkflowsService(
      {
        brand: { findFirst: brandFindFirst },
        workflow: { findFirst },
      } as never,
      logger as never,
      {
        get: (token: unknown) =>
          token === WorkflowExecutionQueueService
            ? { syncWorkflowScheduler }
            : undefined,
      } as never,
    );
    vi.spyOn(service, 'create').mockResolvedValue({
      id: 'created',
      nodes: [],
    } as never);
    vi.spyOn(service, 'executeWorkflow').mockResolvedValue({ mode: 'node' });
  });

  it('replays current edits without a version, scheduler or execution side effect', async () => {
    findFirst.mockResolvedValue(winner());
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
    expect(service.create).not.toHaveBeenCalled();
    expect(syncWorkflowScheduler).not.toHaveBeenCalled();
    expect(service.executeWorkflow).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith({
      include: { currentVersion: true },
      where: {
        organizationId: 'org',
        userId: 'user',
        templateInstantiationKey: 'attempt-1',
        isDeleted: false,
      },
    });
  });

  it('puts internal identity into the atomic creation payload and only schedules the creator', async () => {
    await service.createWorkflow('user', 'org', request(), 'brand');
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        templateInstantiationKey: 'attempt-1',
        templateInstantiationRequestHash: hashTemplateInstantiationRequest(
          'release-loop',
          'brand',
        ),
      }),
    );
    expect(service.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ idempotencyKey: expect.anything() }),
    );
    expect(syncWorkflowScheduler).toHaveBeenCalledTimes(1);
  });

  it('recovers the concurrent winner outside the failed transaction', async () => {
    const conflict = Object.assign(new Error('unique'), { code: 'P2002' });
    vi.mocked(service.create).mockRejectedValue(conflict);
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner());
    expect(
      await service.createWorkflow('user', 'org', request(), 'brand'),
    ).toMatchObject({ id: 'winner' });
    expect(syncWorkflowScheduler).not.toHaveBeenCalled();
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
    brandFindFirst.mockResolvedValue(null);
    findFirst.mockResolvedValue(winner());
    await expect(
      service.createWorkflow('user', 'org', request(), 'brand'),
    ).rejects.toMatchObject({ status: 400 });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rejects a key reserved by a deleted workflow', async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'deleted' });
    await expect(
      service.createWorkflow('user', 'org', request(), 'brand'),
    ).rejects.toMatchObject({ status: 409 });
    expect(service.create).not.toHaveBeenCalled();
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
    expect(service.create).not.toHaveBeenCalled();
  });

  it.each(['other-brand', undefined])(
    'rejects a changed effective brand %s',
    async (brand) => {
      findFirst.mockResolvedValue(winner());
      await expect(
        service.createWorkflow('user', 'org', request(), brand),
      ).rejects.toMatchObject({ status: 409 });
    },
  );

  it('rejects a changed valid seeded template', async () => {
    findFirst.mockResolvedValue({
      ...winner(),
      templateInstantiationRequestHash: 'another-template-hash',
    });
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
