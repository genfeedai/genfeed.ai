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
});
