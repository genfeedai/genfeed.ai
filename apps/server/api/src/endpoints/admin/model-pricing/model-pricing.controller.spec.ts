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
      rows: [],
    });
    const controller = new AdminModelPricingController({ getReport } as never);
    const response = await controller.getReport({
      protocol: 'https',
      get: () => 'api.example',
      originalUrl: '/v1/admin/model-pricing',
    } as never);
    expect(response.data.attributes.rows).toEqual([]);
    const ordinary = ModelSerializer.serialize({
      id: 'ordinary',
      providerCostUsd: 0.2,
      config: { secret: 'must-not-escape' },
    });
    expect(JSON.stringify(ordinary)).not.toContain('providerCostUsd');
    expect(JSON.stringify(ordinary)).not.toContain('must-not-escape');
  });
});
