import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import { RUN_SELECT } from '@api/collections/content-runs/services/brand-remix-runs.types';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentRunStatus } from '@genfeedai/contracts';
import { brandRemixRunConfigSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const config = brandRemixRunConfigSchema.parse({
  contract: 'brand-remix-run',
  draft: {
    fidelityMode: 'guided',
    identity: {},
    intent: { objective: 'Create an original brand execution.' },
    output: { aspectRatio: '1:1', count: 1, kind: 'image' },
    references: [],
    reviewRequired: true,
    target: { kind: 'organic', platform: 'instagram' },
  },
  phase: 'prefilled',
  readiness: { issues: [], state: 'ready' },
  recipeVersion: 1,
  revision: 1,
  sourceSnapshot: {
    capturedAt: '2026-08-20T10:00:00.000Z',
    evidence: ['hook'],
    metrics: {},
    pattern: { hook: 'Outcome-led relevance hook.' },
    platform: 'instagram',
    selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
    sourceId: 'source-post-1',
    title: 'hook',
  },
  version: 1,
});

describe('BrandRemixRunPersistenceService', () => {
  const contentRun = {
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn(),
    contentRun,
  } as unknown as PrismaService;
  let persistence: BrandRemixRunPersistenceService;

  beforeEach(() => {
    vi.resetAllMocks();
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (
        operation: (transaction: { contentRun: typeof contentRun }) => unknown,
      ) => operation({ contentRun }),
    );
    persistence = new BrandRemixRunPersistenceService(prisma);
  });

  it('requires runs with tenant organization and soft-delete scope', async () => {
    contentRun.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      config,
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      id: 'run-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.PENDING,
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
    });

    await persistence.requireRun('org-1', 'run-1');

    expect(contentRun.findFirst).toHaveBeenCalledWith({
      select: RUN_SELECT,
      where: { id: 'run-1', isDeleted: false, organizationId: 'org-1' },
    });
  });

  it('retries serializable reuse-or-create until the prefilled run settles', async () => {
    contentRun.findFirst.mockResolvedValue(null);
    contentRun.create
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockResolvedValueOnce({
        brandId: 'brand-1',
        config,
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        id: 'run-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: ContentRunStatus.PENDING,
        updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      });

    const persisted = await persistence.createOrReusePrefilledRun({
      brandId: 'brand-1',
      config,
      organizationId: 'org-1',
      selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });

    expect(persisted.id).toBe('run-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('reuses the latest editable run for the same tenant-scoped selector', async () => {
    const existing = {
      brandId: 'brand-1',
      config,
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      id: 'run-existing',
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.PENDING,
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
    };
    contentRun.findFirst.mockResolvedValue(existing);

    const persisted = await persistence.createOrReusePrefilledRun({
      brandId: 'brand-1',
      config,
      organizationId: 'org-1',
      selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });

    expect(persisted.id).toBe('run-existing');
    expect(contentRun.create).not.toHaveBeenCalled();
    expect(contentRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('rejects a stale exact-config compare-and-swap without writing', async () => {
    contentRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      persistence.compareAndSwapConfig({
        expectedPhase: 'prefilled',
        expectedRevision: 1,
        nextConfig: { ...config, revision: 2 },
        organizationId: 'org-1',
        runId: 'run-1',
        status: ContentRunStatus.PENDING,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
