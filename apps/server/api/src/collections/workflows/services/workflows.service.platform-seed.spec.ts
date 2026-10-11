import { WorkflowEntity } from '@api/collections/workflows/entities/workflow.entity';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const emptyModuleRef = { get: vi.fn(() => undefined) };
const logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

type Json = Record<string, unknown>;

function createHarness() {
  const workflowCreate = vi.fn(async (args: { data: Json }) => ({
    ...args.data,
    id: 'wf-1',
  }));
  const versionCreate = vi.fn().mockResolvedValue({ id: 'version-2' });
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findFirstOrThrow = vi.fn().mockResolvedValue({
    currentVersion: {
      graph: { edges: [], lockedNodeIds: [], nodes: [] },
      id: 'version-1',
      inputSchema: [],
      version: 1,
    },
    id: 'wf-1',
    organizationId: 'org-1',
    userId: 'user-1',
  });
  const transaction = {
    workflow: { create: workflowCreate, findFirstOrThrow, updateMany },
    workflowVersion: { create: versionCreate },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
  };
  const service = new WorkflowsService(
    prisma as never,
    logger as never,
    emptyModuleRef as never,
  );
  vi.spyOn(service, 'findOne').mockResolvedValue(
    Object.assign(new WorkflowEntity({}), {
      edges: [],
      id: 'wf-1',
      inputVariables: [],
      lockedNodeIds: [],
      nodes: [],
      organizationId: 'org-1',
      userId: 'user-1',
      version: 1,
      versionId: 'version-1',
    }),
  );
  return { findFirstOrThrow, service, updateMany, workflowCreate };
}

describe('WorkflowsService platform seed marker (#6689)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    const dto = {
      edges: [],
      label: 'Seeded',
      nodes: [],
      organizationId: 'org-1',
      userId: 'user-1',
    };

    it('drops a marker supplied in the create input', async () => {
      const { service, workflowCreate } = createHarness();

      await service.create({
        ...dto,
        platformSeedKey: 'analytics-facebook-sync',
      } as never);

      const data = workflowCreate.mock.calls[0]?.[0].data;
      expect(data).not.toHaveProperty('platformSeedKey');
    });

    it('writes the marker only through the seeder entry point', async () => {
      const { service, workflowCreate } = createHarness();

      await service.createPlatformSeeded(
        // An input marker never wins over the seeder's own key.
        { ...dto, platformSeedKey: 'forged' } as never,
        'analytics-facebook-sync',
      );

      expect(workflowCreate.mock.calls[0]?.[0].data).toMatchObject({
        platformSeedKey: 'analytics-facebook-sync',
      });
    });

    it('never lets tenant create, template create or clone carry a marker', async () => {
      const { service } = createHarness();
      const create = vi.spyOn(service, 'create').mockResolvedValue({
        id: 'wf-2',
        metadata: {},
        nodes: [],
      } as never);
      vi.spyOn(service, 'findVisibleOrThrow').mockResolvedValue({
        brandId: null,
        edges: [],
        id: 'seeded',
        inputVariables: [],
        isScheduleEnabled: true,
        label: 'Seeded',
        lockedNodeIds: [],
        metadata: {},
        nodes: [],
        organizationId: 'org-1',
        platformSeedKey: 'analytics-facebook-sync',
        schedule: '0 * * * *',
        userId: 'owner',
      } as never);

      await service.createWorkflow('user-1', 'org-1', {
        edges: [],
        nodes: [],
        platformSeedKey: 'analytics-facebook-sync',
      } as never);
      await service.createWorkflow('user-1', 'org-1', {
        platformSeedKey: 'analytics-facebook-sync',
        templateId: 'release-loop',
      } as never);
      await service.cloneWorkflow('seeded', 'user-1', 'org-1');

      expect(create).toHaveBeenCalledTimes(3);
      for (const [input] of create.mock.calls) {
        expect(input).not.toHaveProperty('platformSeedKey');
      }
    });
  });

  describe('patch', () => {
    it('rejects the marker in a patch', async () => {
      const { service } = createHarness();

      await expect(
        service.patch('wf-1', { platformSeedKey: 'analytics-facebook-sync' }),
      ).rejects.toThrow('server-owned');
      await expect(
        service.patch('wf-1', { label: 'x', platformSeedKey: null }),
      ).rejects.toThrow('server-owned');
    });

    it.each([
      ['nodes', { nodes: [] }],
      ['edges', { edges: [] }],
      ['input variables', { inputVariables: [] }],
      ['locked nodes', { lockedNodeIds: [] }],
      ['edge style', { edgeStyle: 'straight' }],
    ])(
      'clears the marker in the same write as a %s edit',
      async (_name, patch) => {
        const { service, updateMany } = createHarness();

        await service.patch('wf-1', patch);

        expect(updateMany).toHaveBeenCalledWith({
          data: expect.objectContaining({
            currentVersionId: 'version-2',
            platformSeedKey: null,
          }),
          where: expect.objectContaining({ id: 'wf-1' }),
        });
      },
    );

    it.each([
      ['metadata (swaps the template identity)', { metadata: {} }],
      ['the template id', { templateId: 'other-template' }],
      ['config', { config: {} }],
      ['the brand', { brandId: 'brand-1' }],
      ['the trigger', { trigger: 'manual' }],
    ])('clears the marker when a patch changes %s', async (_name, patch) => {
      const { service } = createHarness();
      const basePatch = vi
        .spyOn(BaseService.prototype, 'patch')
        .mockResolvedValue({} as never);

      await service.patch('wf-1', patch);

      expect(basePatch.mock.calls[0]?.[1]).toMatchObject({
        platformSeedKey: null,
      });
    });

    it.each([
      ['a cron change', { schedule: '*/5 * * * *' }],
      ['a timezone change', { timezone: 'Europe/Berlin' }],
      ['disabling the schedule', { isScheduleEnabled: false }],
      ['a label edit', { label: 'Renamed' }],
    ])('keeps the marker for %s', async (_name, patch) => {
      const { service, updateMany } = createHarness();
      const basePatch = vi
        .spyOn(BaseService.prototype, 'patch')
        .mockResolvedValue({} as never);

      await service.patch('wf-1', patch);

      expect(basePatch.mock.calls[0]?.[1]).not.toHaveProperty(
        'platformSeedKey',
      );
      expect(updateMany).not.toHaveBeenCalled();
    });
  });
});
