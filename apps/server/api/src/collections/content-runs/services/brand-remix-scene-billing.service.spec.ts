import { describe, expect, it, vi } from 'vitest';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { BrandRemixSceneStoreService } from './brand-remix-scene-store.service';
import { BrandRemixSceneBillingService } from './brand-remix-scene-billing.service';
import { initialScenePipeline } from './brand-remix-scene-state';

describe('scene credit ownership', () => {
  it('separates new operation charges while keeping resume keys stable', () => {
    const service = new BrandRemixSceneBillingService(
      {} as CreditsUtilsService,
      {} as BrandRemixSceneStoreService,
    );
    const line = {
      key: 'run-captions-1',
      stage: 'captions' as const,
      model: 'whisper',
      credits: 1,
      billingMode: 'platform' as const,
      attempt: 1,
    };
    expect(service.key('run', 'operation-a', line)).toBe(
      service.key('run', 'operation-a', line),
    );
    expect(service.key('run', 'operation-a', line)).not.toBe(
      service.key('run', 'operation-b', line),
    );
  });
  it('adopts an image-owned reservation without reserving twice', async () => {
    const pipeline = {
      ...initialScenePipeline(),
      operation: {
        id: 'operation',
        quoteId: 'quote',
        revision: 1,
        cancellationGeneration: 0,
        startedAt: new Date().toISOString(),
        userId: 'user',
        sequence: 0,
      },
    };
    const config = { scenePipeline: pipeline };
    const credits = { reserveCredits: vi.fn() };
    const store = {
      fence: vi.fn().mockResolvedValue({ config }),
      save: vi.fn(),
    };
    const service = new BrandRemixSceneBillingService(
      credits as unknown as CreditsUtilsService,
      store as unknown as BrandRemixSceneStoreService,
    );
    await service.reserve(
      'org',
      'run',
      'operation',
      {
        key: 'scene-image-1',
        stage: 'image',
        model: 'image-model',
        credits: 2,
        billingMode: 'platform',
        attempt: 1,
      },
      'existing-reservation',
    );
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(store.save.mock.calls[0][3].scenePipeline.receipts[0].key).toBe(
      'generation:remix-run-operation-scene-image-1',
    );
  });
});

vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-store.service',
  () => ({ BrandRemixSceneStoreService: class {} }),
);
vi.mock('@api/collections/credits/services/credits.utils.service', () => ({
  CreditsUtilsService: class {},
}));

describe('pre-dispatch reservation compensation', () => {
  it('releases the deterministic hold if receipt CAS fails before dispatch', async () => {
    const config = {
      scenePipeline: {
        ...initialScenePipeline(),
        operation: { id: 'op', userId: 'user' },
      },
    };
    const credits = {
      reserveCredits: vi.fn().mockResolvedValue({ id: 'reservation' }),
      releaseReservation: vi.fn(),
    };
    const store = {
      fence: vi.fn().mockResolvedValue({ config }),
      save: vi.fn().mockRejectedValue(new Error('CAS conflict')),
    };
    const service = new BrandRemixSceneBillingService(
      credits as unknown as CreditsUtilsService,
      store as unknown as BrandRemixSceneStoreService,
    );
    await expect(
      service.reserve('org', 'run', 'op', {
        key: 'run-analysis-1',
        stage: 'analysis',
        model: 'semantic',
        credits: 1,
        billingMode: 'platform',
        attempt: 1,
      }),
    ).rejects.toThrow('CAS conflict');
    expect(credits.releaseReservation).toHaveBeenCalledExactlyOnceWith({
      organizationId: 'org',
      idempotencyKey: 'remix-run-op-run-analysis-1',
    });
  });
});
