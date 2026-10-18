import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminModelPricingController } from '@api/endpoints/admin/model-pricing/model-pricing.controller';
import { ModelSerializer } from '@genfeedai/serializers';
import { describe, expect, it, vi } from 'vitest';

describe('private operator pricing boundary', () => {
  it('requires platform admin and IP allowlist guards', () => {
    expect(
      Reflect.getMetadata('__guards__', AdminModelPricingController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });
  it('serializes source and snapshot metadata without widening the ordinary model serializer', async () => {
    const getReport = vi.fn().mockResolvedValue({
      id: 'model-pricing',
      source: 'https://api.example/v1/admin/model-pricing',
      retrievedAt: '2026-09-30T00:00:00Z',
      isConversionPolicyConfigured: false,
      marginMultiplierGeneration: null,
      rows: [],
    });
    const controller = new AdminModelPricingController(
      { getReport } as never,
      {} as never,
    );
    const response = await controller.getReport({
      protocol: 'https',
      get: () => 'api.example',
      originalUrl: '/v1/admin/model-pricing',
    } as never);
    expect(response).toMatchObject({
      data: { attributes: { rows: [], marginMultiplierGeneration: null } },
    });
    const ordinary = ModelSerializer.serialize({
      id: 'ordinary',
      providerCostUsd: 0.2,
      config: { secret: 'must-not-escape' },
    });
    expect(JSON.stringify(ordinary)).not.toContain('providerCostUsd');
    expect(JSON.stringify(ordinary)).not.toContain('must-not-escape');
  });
  it('approves pending rates as the authenticated operator and returns the refreshed report', async () => {
    const report = {
      id: 'model-pricing',
      isConversionPolicyConfigured: true,
      marginMultiplierGeneration: 3.33,
      retrievedAt: '2026-10-05T00:00:00Z',
      rows: [],
      source: 'https://api.example/v1/admin/model-pricing',
    };
    const approveRates = vi.fn().mockResolvedValue({});
    const getReport = vi.fn().mockResolvedValue(report);
    const controller = new AdminModelPricingController(
      {
        approveRates,
        getReport,
      } as never,
      {} as never,
    );
    const request = {
      context: { userId: 'operator-1' },
      get: () => 'api.example',
      originalUrl: '/v1/admin/model-pricing/model-1/approve-rates',
      protocol: 'https',
    } as never;

    const response = await controller.approveRates(request, 'model-1', {
      expectedPendingVersion: 'rates-v2',
    });

    expect(approveRates).toHaveBeenCalledWith(
      'model-1',
      'operator-1',
      'rates-v2',
    );
    expect(getReport).toHaveBeenCalledWith(
      'https://api.example/v1/admin/model-pricing',
    );
    expect(response).toMatchObject({
      data: { attributes: { rows: [], marginMultiplierGeneration: 3.33 } },
    });
  });
  it('refuses an approval without an authenticated operator', async () => {
    const approveRates = vi.fn();
    const controller = new AdminModelPricingController(
      {
        approveRates,
      } as never,
      {} as never,
    );

    await expect(
      controller.approveRates({ context: {} } as never, 'model-1', {
        expectedPendingVersion: 'rates-v2',
      }),
    ).rejects.toThrow();
    expect(approveRates).not.toHaveBeenCalled();
  });
  it('requires the pending version the operator reviewed', async () => {
    const approveRates = vi.fn();
    const controller = new AdminModelPricingController(
      {
        approveRates,
      } as never,
      {} as never,
    );

    await expect(
      controller.approveRates(
        { context: { userId: 'operator-1' } } as never,
        'model-1',
        {},
      ),
    ).rejects.toThrow('expectedPendingVersion');
    expect(approveRates).not.toHaveBeenCalled();
  });
  describe('sync', () => {
    function buildController() {
      const enqueue = vi
        .fn()
        .mockResolvedValue([{ jobId: 'job-1', provider: 'fal' }]);
      return {
        controller: new AdminModelPricingController(
          {} as never,
          {
            enqueue,
          } as never,
        ),
        enqueue,
      };
    }

    it('queues every provider by default', async () => {
      const { controller, enqueue } = buildController();

      const response = await controller.sync(undefined);

      expect(enqueue).toHaveBeenCalledWith(['fal', 'replicate']);
      expect(response).toEqual({
        queued: [{ jobId: 'job-1', provider: 'fal' }],
      });
    });

    it('queues a single named provider', async () => {
      const { controller, enqueue } = buildController();

      await controller.sync({ provider: 'replicate' });

      expect(enqueue).toHaveBeenCalledWith(['replicate']);
    });

    it('rejects an unknown provider without queueing', async () => {
      const { controller, enqueue } = buildController();

      await expect(controller.sync({ provider: 'openai' })).rejects.toThrow(
        'provider must be one of',
      );
      expect(enqueue).not.toHaveBeenCalled();
    });
  });
  describe('fix', () => {
    const request = { context: { userId: 'operator-1' } } as never;

    function buildController(result: Record<string, unknown>) {
      const fixPricing = vi.fn().mockResolvedValue({
        approved: [],
        changed: [],
        syncQueued: [],
        unresolved: [],
        ...result,
      });
      const enqueue = vi.fn().mockResolvedValue([]);
      return {
        controller: new AdminModelPricingController(
          { fixPricing } as never,
          { enqueue } as never,
        ),
        enqueue,
        fixPricing,
      };
    }

    it('fixes the named models as the authenticated operator', async () => {
      const { controller, fixPricing } = buildController({
        approved: [{ id: 'model-1', key: 'fal/one' }],
      });

      const response = await controller.fix(request, {
        modelIds: ['model-1'],
      });

      expect(fixPricing).toHaveBeenCalledWith('operator-1', ['model-1']);
      expect(response).toMatchObject({
        approved: [{ id: 'model-1', key: 'fal/one' }],
      });
    });

    it('fixes every model that needs it when none are named', async () => {
      const { controller, fixPricing } = buildController({});

      await controller.fix(request, undefined);

      expect(fixPricing).toHaveBeenCalledWith('operator-1', undefined);
    });

    it('queues one provider price import per provider that has models without rates', async () => {
      const { controller, enqueue } = buildController({
        syncQueued: [
          { id: 'a', key: 'fal/a', provider: 'fal' },
          { id: 'b', key: 'fal/b', provider: 'fal' },
          { id: 'c', key: 'replicate/c', provider: 'replicate' },
        ],
      });

      await controller.fix(request, {});

      expect(enqueue).toHaveBeenCalledWith(['fal', 'replicate']);
    });

    it('does not queue an import when every model was fixed or needs a hand-set price', async () => {
      const { controller, enqueue } = buildController({
        unresolved: [{ id: 'a', key: 'x/a', reason: 'No price' }],
      });

      await controller.fix(request, {});

      expect(enqueue).not.toHaveBeenCalled();
    });

    it('refuses without an authenticated operator', async () => {
      const { controller, fixPricing } = buildController({});

      await expect(
        controller.fix({ context: {} } as never, {}),
      ).rejects.toThrow();
      expect(fixPricing).not.toHaveBeenCalled();
    });

    it('rejects a malformed model list', async () => {
      const { controller, fixPricing } = buildController({});

      await expect(
        controller.fix(request, { modelIds: 'model-1' }),
      ).rejects.toThrow('modelIds');
      expect(fixPricing).not.toHaveBeenCalled();
    });
  });
});
