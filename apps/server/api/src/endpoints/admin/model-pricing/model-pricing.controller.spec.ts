import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminModelPricingController } from '@api/endpoints/admin/model-pricing/model-pricing.controller';
import type { AdminModelPricingService } from '@api/endpoints/admin/model-pricing/model-pricing.service';
import type { ProviderPriceSyncService } from '@api/endpoints/admin/model-pricing/provider-price-sync.service';
import { ModelSerializer } from '@genfeedai/serializers';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

interface FixResult {
  approved: { id: string; key: string }[];
  changed: unknown[];
  syncQueued: { id: string; key: string; provider: string }[];
  unresolved: { id: string; key: string; reason: string }[];
}

/**
 * The pricing store and the provider price-import queue. Approvals, fix
 * requests, report reads and queued imports are recorded as they happen.
 */
function setup(fix: Partial<FixResult> = {}) {
  const approvals: { modelId: string; operator: string; version: string }[] =
    [];
  const fixRequests: { modelIds?: string[]; operator: string }[] = [];
  const reportSources: string[] = [];
  const queuedImports: string[][] = [];
  const pricing = {
    approveRates: async (
      modelId: string,
      operator: string,
      version: string,
    ) => {
      approvals.push({ modelId, operator, version });
      return {};
    },
    fixPricing: async (operator: string, modelIds?: string[]) => {
      fixRequests.push({ modelIds, operator });
      return {
        approved: [],
        changed: [],
        syncQueued: [],
        unresolved: [],
        ...fix,
      };
    },
    getReport: async (source: string) => {
      reportSources.push(source);
      return {
        id: 'model-pricing',
        isConversionPolicyConfigured: approvals.length > 0,
        marginMultiplierGeneration: approvals.length > 0 ? 3.33 : null,
        retrievedAt: '2026-10-05T00:00:00Z',
        rows: [],
        source,
      };
    },
  };
  const priceSync = {
    enqueue: async (providers: string[]) => {
      queuedImports.push(providers);
      return providers.map((provider) => ({
        jobId: `job-${provider}`,
        provider,
      }));
    },
  };
  const controller = new AdminModelPricingController(
    pricing as unknown as AdminModelPricingService,
    priceSync as unknown as ProviderPriceSyncService,
  );
  return {
    approvals,
    controller,
    fixRequests,
    queuedImports,
    reportSources,
  };
}

const operatorRequest = (originalUrl: string) =>
  ({
    context: { userId: 'operator-1' },
    get: () => 'api.example',
    originalUrl,
    protocol: 'https',
  }) as unknown as Request;

const anonymousRequest = { context: {} } as unknown as Request;

describe('private operator pricing boundary', () => {
  it('requires platform admin and IP allowlist guards', () => {
    expect(
      Reflect.getMetadata('__guards__', AdminModelPricingController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it('serializes source and snapshot metadata without widening the ordinary model serializer', async () => {
    const { controller, reportSources } = setup();

    const response = await controller.getReport(
      operatorRequest('/v1/admin/model-pricing'),
    );

    expect(response).toMatchObject({
      data: { attributes: { marginMultiplierGeneration: null, rows: [] } },
    });
    expect(reportSources).toEqual([
      'https://api.example/v1/admin/model-pricing',
    ]);
    const ordinary = ModelSerializer.serialize({
      config: { secret: 'must-not-escape' },
      id: 'ordinary',
      providerCostUsd: 0.2,
    });
    expect(JSON.stringify(ordinary)).not.toContain('providerCostUsd');
    expect(JSON.stringify(ordinary)).not.toContain('must-not-escape');
  });

  it('approves pending rates as the authenticated operator and returns the refreshed report', async () => {
    const { approvals, controller, reportSources } = setup();

    const response = await controller.approveRates(
      operatorRequest('/v1/admin/model-pricing/model-1/approve-rates'),
      'model-1',
      { expectedPendingVersion: 'rates-v2' },
    );

    expect(approvals).toEqual([
      { modelId: 'model-1', operator: 'operator-1', version: 'rates-v2' },
    ]);
    expect(reportSources).toEqual([
      'https://api.example/v1/admin/model-pricing',
    ]);
    expect(response).toMatchObject({
      data: { attributes: { marginMultiplierGeneration: 3.33, rows: [] } },
    });
  });

  it('refuses an approval without an authenticated operator', async () => {
    const { approvals, controller } = setup();

    await expect(
      controller.approveRates(anonymousRequest, 'model-1', {
        expectedPendingVersion: 'rates-v2',
      }),
    ).rejects.toThrow();
    expect(approvals).toEqual([]);
  });

  it('requires the pending version the operator reviewed', async () => {
    const { approvals, controller } = setup();

    await expect(
      controller.approveRates(
        operatorRequest('/v1/admin/model-pricing/model-1/approve-rates'),
        'model-1',
        {},
      ),
    ).rejects.toThrow('expectedPendingVersion');
    expect(approvals).toEqual([]);
  });

  describe('sync', () => {
    it('queues every provider by default', async () => {
      const { controller, queuedImports } = setup();

      const response = await controller.sync(undefined);

      expect(queuedImports).toEqual([['fal', 'replicate']]);
      expect(response).toEqual({
        queued: [
          { jobId: 'job-fal', provider: 'fal' },
          { jobId: 'job-replicate', provider: 'replicate' },
        ],
      });
    });

    it('queues a single named provider', async () => {
      const { controller, queuedImports } = setup();

      await controller.sync({ provider: 'replicate' });

      expect(queuedImports).toEqual([['replicate']]);
    });

    it('rejects an unknown provider without queueing', async () => {
      const { controller, queuedImports } = setup();

      await expect(controller.sync({ provider: 'openai' })).rejects.toThrow(
        'provider must be one of',
      );
      expect(queuedImports).toEqual([]);
    });
  });

  describe('fix', () => {
    const request = operatorRequest('/v1/admin/model-pricing/fix');

    it('fixes the named models as the authenticated operator', async () => {
      const { controller, fixRequests } = setup({
        approved: [{ id: 'model-1', key: 'fal/one' }],
      });

      const response = await controller.fix(request, {
        modelIds: ['model-1'],
      });

      expect(fixRequests).toEqual([
        { modelIds: ['model-1'], operator: 'operator-1' },
      ]);
      expect(response).toMatchObject({
        approved: [{ id: 'model-1', key: 'fal/one' }],
      });
    });

    it('fixes every model that needs it when none are named', async () => {
      const { controller, fixRequests } = setup();

      await controller.fix(request, undefined);

      expect(fixRequests).toEqual([
        { modelIds: undefined, operator: 'operator-1' },
      ]);
    });

    it('queues one provider price import per provider that has models without rates', async () => {
      const { controller, queuedImports } = setup({
        syncQueued: [
          { id: 'a', key: 'fal/a', provider: 'fal' },
          { id: 'b', key: 'fal/b', provider: 'fal' },
          { id: 'c', key: 'replicate/c', provider: 'replicate' },
        ],
      });

      await controller.fix(request, {});

      expect(queuedImports).toEqual([['fal', 'replicate']]);
    });

    it('does not queue an import when every model was fixed or needs a hand-set price', async () => {
      const { controller, queuedImports } = setup({
        unresolved: [{ id: 'a', key: 'x/a', reason: 'No price' }],
      });

      await controller.fix(request, {});

      expect(queuedImports).toEqual([]);
    });

    it('refuses without an authenticated operator', async () => {
      const { controller, fixRequests } = setup();

      await expect(controller.fix(anonymousRequest, {})).rejects.toThrow();
      expect(fixRequests).toEqual([]);
    });

    it('rejects a malformed model list', async () => {
      const { controller, fixRequests } = setup();

      await expect(
        controller.fix(request, { modelIds: 'model-1' }),
      ).rejects.toThrow('modelIds');
      expect(fixRequests).toEqual([]);
    });
  });
});
