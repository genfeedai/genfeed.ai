import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import type { StoryboardRunCapabilitiesService } from '@api/collections/content-runs/services/storyboard-run-capabilities.service';
import { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import { StoryboardRunsService } from '@api/collections/content-runs/services/storyboard-runs.service';
import { StoryboardSourceService } from '@api/collections/content-runs/services/storyboard-source.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { StoryboardRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { describe, expect, it, vi } from 'vitest';

const input = {
  clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
  source: { kind: 'brief', brief: '', seedImageAssetId: 'image-1' },
};
function setup() {
  let saved: {
    id: string;
    brandId: string;
    organizationId: string;
    createdAt: Date;
    updatedAt: Date;
    config: StoryboardRunConfig;
  } | null = null;
  const create = vi.fn(
    async ({ data }: { data: { config: StoryboardRunConfig } }) => {
      saved = {
        ...data,
        id: 'run-1',
        organizationId: 'org-1',
        brandId: 'brand-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return saved;
    },
  );
  const findFirst = vi.fn(async () => saved);
  const transaction = { contentRun: { findFirst, create } };
  const prisma = {
    $transaction: vi.fn(
      async (work: (client: typeof transaction) => Promise<unknown>) =>
        work(transaction),
    ),
  };
  const planning = {
    resolveBrandContext: vi.fn(async () => ({
      brandKit: { references: [], products: [], logos: [], avatars: [] },
    })),
  };
  const source = {
    resolve: vi.fn(async () => ({
      selector: input.source,
      capturedAt: new Date().toISOString(),
    })),
    validatePlanAssets: vi.fn(async () => undefined),
  };
  const service = new StoryboardRunsService(
    prisma as unknown as PrismaService,
    planning as unknown as BrandRemixRunPlanningService,
    source as unknown as StoryboardSourceService,
    {} as StoryboardRunStoreService,
    {} as StoryboardRunCapabilitiesService,
  );
  return { service, prisma, planning, source, create, findFirst };
}
describe('Durable storyboard creation', () => {
  it('saves a seeded image shell without paid work or invented action/duration', async () => {
    const { service, prisma } = setup();
    const run = await service.create('org-1', 'brand-1', 'user-1', input);
    expect(run.config.plan.runtimeBudgetSeconds).toBeNull();
    expect(run.config.plan.shots[0]).toMatchObject({
      action: '',
      durationSeconds: null,
      stillAssetId: 'image-1',
      stillFreshness: 'stale',
    });
    expect(run.config.plan.cast).toEqual([]);
    expect(run.config.quote).toBeUndefined();
    expect(run.config.scenePipeline).toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('replays identical intent without re-resolving source or changed defaults', async () => {
    const { service, planning, source, create } = setup();
    const first = await service.create('org-1', 'brand-1', 'user-1', input);
    planning.resolveBrandContext.mockRejectedValue(
      new Error('Changed defaults'),
    );
    const retry = await service.create('org-1', 'brand-1', 'user-1', {
      source: { seedImageAssetId: 'image-1', brief: '', kind: 'brief' },
      clientRequestId: input.clientRequestId,
    });
    expect(retry).toEqual(first);
    expect(create).toHaveBeenCalledTimes(1);
    expect(source.resolve).toHaveBeenCalledTimes(1);
  });
  it('rejects different submitted intent under the same creation identity', async () => {
    const { service, create } = setup();
    await service.create('org-1', 'brand-1', 'user-1', input);
    await expect(
      service.create('org-1', 'brand-1', 'user-1', {
        ...input,
        source: { ...input.source, brief: 'Different intent' },
      }),
    ).rejects.toThrow('different storyboard');
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('scopes lookup to org, brand, canonical user ID, live record and request UUID', async () => {
    const { service, findFirst } = setup();
    await service.create('org-1', 'brand-1', 'user-1', input);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          brandId: 'brand-1',
          isDeleted: false,
          AND: expect.arrayContaining([
            { config: { path: ['createdByUserId'], equals: 'user-1' } },
            {
              config: {
                path: ['clientRequestId'],
                equals: input.clientRequestId,
              },
            },
          ]),
        }),
      }),
    );
  });
  it('retries serialization conflicts rather than creating a second run', async () => {
    const { service, prisma, create } = setup();
    prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('Conflict'), { code: 'P2034' }),
    );
    await service.create('org-1', 'brand-1', 'user-1', input);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
