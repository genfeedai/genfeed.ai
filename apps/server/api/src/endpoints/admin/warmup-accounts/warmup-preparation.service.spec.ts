import type { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AdminWarmupAccountsService } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.service';
import { WarmupPreparationService } from '@api/endpoints/admin/warmup-accounts/warmup-preparation.service';
import { lockWarmup } from '@api/endpoints/admin/warmup-accounts/warmup-workspace';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IWarmupPreparation } from '@genfeedai/contracts/interfaces';
import type { Prisma, WarmupAccount } from '@genfeedai/prisma';
import type { ModuleRef } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/endpoints/admin/warmup-accounts/warmup-workspace',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@api/endpoints/admin/warmup-accounts/warmup-workspace')
    >()),
    lockWarmup: vi.fn(),
    reconcileWarmupWorkspace: vi.fn().mockResolvedValue({
      balance: { balance: 500, heldAmount: 0, version: 1 },
    }),
    creditWarmupWallet: vi
      .fn()
      .mockResolvedValue({ id: 'grant-1', createdAt: new Date('2026-09-08') }),
  }),
);

function fixture(preparation: IWarmupPreparation = {}) {
  const account = {
    id: 'warmup-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    customerUserId: 'customer-1',
    operatorUserId: 'operator-1',
    status: 'PROVISIONED',
    auditEvents: [],
    diagnostics: { steps: [], preparation },
  } as unknown as WarmupAccount;
  const tx = {
    warmupAccount: {
      findFirst: vi.fn().mockResolvedValue(account),
      findFirstOrThrow: vi.fn().mockResolvedValue(account),
      update: vi.fn(),
    },
    workflowExecution: { findFirst: vi.fn().mockResolvedValue(null) },
    asset: { findFirst: vi.fn().mockResolvedValue(null) },
    article: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    invitation: { updateMany: vi.fn() },
    member: { updateMany: vi.fn() },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const brands = {
    crawlWebsiteBrandKitDraft: vi.fn(),
    applyBrandKitDraft: vi.fn().mockResolvedValue({
      status: 'accepted',
      appliedFields: ['description'],
    }),
    importBrandKitAssets: vi.fn(),
  };
  const workflows = {
    enqueueWorkflow: vi.fn().mockResolvedValue({ executionId: 'run-1' }),
  };
  const resume = vi.fn();
  const service = new WarmupPreparationService(
    prisma as unknown as PrismaService,
    {
      get: vi.fn().mockResolvedValue(account),
    } as unknown as AdminWarmupAccountsService,
    brands as unknown as BrandsService,
    workflows as unknown as SystemWorkflowRunnerService,
    {
      get: () => ({ continueExistingExecution: resume }),
    } as unknown as ModuleRef,
    {} as BrandScraperService,
    {} as BrandDataMapper,
  );
  return { account, tx, prisma, brands, workflows, resume, service };
}

const grant: NonNullable<IWarmupPreparation['grant']> = {
  amount: 500,
  actorUserId: 'operator-1',
  reason: 'Evaluation',
  grantedAt: '2026-09-08',
  transactionId: 'grant-1',
};

describe('warm-up preparation orchestration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects content authored through a different operator identity', async () => {
    const { service, brands } = fixture();
    await expect(
      service.prepare('warmup-1', 'other-operator', {
        action: 'preview-context',
        sourceUrl: 'https://example.com',
      }),
    ).rejects.toThrow('recorded preparation operator');
    expect(brands.crawlWebsiteBrandKitDraft).not.toHaveBeenCalled();
  });

  it('does not apply context after claim wins the lock', async () => {
    const { service, brands, tx, account } = fixture();
    tx.warmupAccount.findFirstOrThrow.mockResolvedValue({
      ...account,
      status: 'CLAIMED',
    });
    await expect(
      service.prepare('warmup-1', 'operator-1', {
        action: 'apply-context',
        contextDecisions: {
          fields: {
            description: {
              action: 'accept',
              value: 'Public company description',
            },
          },
        },
      }),
    ).rejects.toThrow('no longer in preparation');
    expect(brands.applyBrandKitDraft).not.toHaveBeenCalled();
  });

  it('requires an explicit reviewed context decision rather than automatic apply', async () => {
    const { service, brands, tx } = fixture();
    await expect(
      service.prepare('warmup-1', 'operator-1', { action: 'apply-context' }),
    ).rejects.toThrow('Select the imported context fields');
    expect(brands.applyBrandKitDraft).not.toHaveBeenCalled();
    expect(tx.warmupAccount.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'warmup-1', organizationId: 'org-1', isDeleted: false },
    });
    expect(tx.warmupAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'warmup-1', organizationId: 'org-1', isDeleted: false },
      }),
    );
  });

  it('rejects replacing an existing promised grant with a different amount', async () => {
    const { service } = fixture({ grant });
    await expect(
      service.prepare('warmup-1', 'operator-1', {
        action: 'fund',
        amount: 1000,
        reason: 'Retry',
      }),
    ).rejects.toThrow('already configured');
  });

  it('does not generate before context has been reviewed', async () => {
    const { service, workflows } = fixture({ grant });
    await expect(
      service.prepare('warmup-1', 'operator-1', { action: 'starter-content' }),
    ).rejects.toThrow('Review brand context');
    expect(workflows.enqueueWorkflow).not.toHaveBeenCalled();
  });

  it('queues exactly one private article with a durable key and the real operator', async () => {
    const { service, workflows } = fixture({
      grant,
      assetId: 'asset-1',
      contextReviewedAt: '2026-09-08',
    });
    await service.prepare('warmup-1', 'operator-1', {
      action: 'starter-content',
    });
    expect(workflows.enqueueWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'warmup:warmup-1:starter-article',
        organizationId: 'org-1',
        userId: 'operator-1',
        inputValues: {
          brandId: 'brand-1',
          dto: expect.objectContaining({
            category: 'linkedin-article',
            count: 1,
            generateHeaderImage: false,
          }),
        },
      }),
    );
    expect(workflows.enqueueWorkflow).toHaveBeenCalledTimes(1);
    expect(lockWarmup).toHaveBeenCalledWith(
      expect.anything(),
      'warmup-1:starter-dispatch',
    );
  });

  it('rejects a concurrent starter request when a durable operation already exists', async () => {
    const { service, workflows, tx, account } = fixture({
      grant,
      assetId: 'asset-1',
      contextReviewedAt: '2026-09-08',
    });
    tx.warmupAccount.findFirstOrThrow.mockResolvedValue({
      ...account,
      diagnostics: {
        preparation: { generation: { status: 'running', key: 'existing' } },
      },
    });
    await expect(
      service.prepare('warmup-1', 'operator-1', { action: 'starter-content' }),
    ).rejects.toThrow('already running');
    expect(workflows.enqueueWorkflow).not.toHaveBeenCalled();
  });

  it('refuses foreign or published starter identifiers', async () => {
    const { service, tx } = fixture();
    await expect(
      service.prepare('warmup-1', 'operator-1', {
        action: 'attach-starters',
        assetId: 'foreign-asset',
        articleId: 'foreign-article',
      }),
    ).rejects.toThrow('must belong');
    expect(tx.article.update).not.toHaveBeenCalled();
  });

  it('does not archive while a starter workflow can still write outputs', async () => {
    const { service, tx } = fixture({
      assetId: 'asset-1',
      generation: {
        key: 'starter-key',
        status: 'running',
        startedAt: new Date().toISOString(),
      },
    });
    await expect(
      service.prepare('warmup-1', 'operator-1', { action: 'archive' }),
    ).rejects.toThrow('Wait for generation');
    expect(tx.invitation.updateMany).not.toHaveBeenCalled();
  });

  it('preserves an existing queued workflow during repair instead of creating a replacement', async () => {
    const { service, tx, workflows } = fixture({
      generation: {
        key: 'starter-key',
        status: 'running',
        startedAt: '2020-01-01T00:00:00.000Z',
      },
    });
    tx.workflowExecution.findFirst.mockResolvedValue({
      id: 'existing-run',
      status: 'QUEUED',
      nodeResults: [],
    } as never);
    await service.prepare('warmup-1', 'operator-1', { action: 'repair' });
    expect(workflows.enqueueWorkflow).not.toHaveBeenCalled();
    expect(tx.warmupAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          diagnostics: expect.objectContaining({
            preparation: expect.objectContaining({
              generation: expect.objectContaining({ key: 'starter-key' }),
            }),
          }),
        }),
      }),
    );
  });

  it('recovers a pre-queue interruption after the bounded lease instead of leaving it permanently running', async () => {
    const { service, tx, workflows } = fixture({
      grant,
      contextReviewedAt: '2026-09-08',
      assetId: 'asset-1',
      generation: {
        key: 'starter-key',
        status: 'running',
        startedAt: '2020-01-01T00:00:00.000Z',
      },
    });
    await service.prepare('warmup-1', 'operator-1', { action: 'repair' });
    const data = tx.warmupAccount.update.mock.calls[0][0].data as {
      diagnostics: Prisma.JsonObject;
    };
    expect(workflows.enqueueWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'starter-key' }),
    );
    expect(data.diagnostics.preparation).toHaveProperty(
      'generation.key',
      'starter-key',
    );
  });
});
