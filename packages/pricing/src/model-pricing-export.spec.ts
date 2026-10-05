import type { AdminModelPricingReport } from '@genfeedai/contracts/interfaces';
import { expect, it } from 'vitest';
import { exportModelPricingCsv } from './model-pricing-export';

it('exports the same dated snapshot with unresolved values and prevents spreadsheet formula execution', () => {
  const report = {
    id: 'model-pricing',
    retrievedAt: '2026-09-30T00:00:00Z',
    source: 'https://api.example/admin/model-pricing',
    isConversionPolicyConfigured: false,
    marginMultiplierGeneration: null,
    rows: [
      {
        id: 'model',
        pending: null,
        key: '=IMPORTXML("secret")',
        provider: 'provider',
        category: 'image',
        isActive: true,
        isFree: false,
        lifecycle: 'AVAILABLE',
        pricingType: null,
        configuredProviderCostUsd: null,
        configuredCost: 0,
        configuredCostPerUnit: null,
        configuredMinCost: null,
        effectiveUnitCredits: null,
        effectiveSampleCredits: null,
        sampleDuration: null,
        inputCostPerMillionTokens: null,
        outputCostPerMillionTokens: null,
        dimensions: { resolution: ['1K', '4K'] },
        reviewed: null,
        status: 'unresolved',
        reasons: ['Unknown price'],
        attention: [],
        attentionLevel: null,
        isRateApprovalAvailable: false,
        pendingRateChanges: [],
        providerPricingSyncedAt: null,
        providerSyncFailureCode: null,
        providerSyncStatus: null,
      },
    ],
  } satisfies AdminModelPricingReport;
  const csv = exportModelPricingCsv(report);
  expect(csv).toContain('2026-09-30T00:00:00Z');
  expect(csv).toContain('https://api.example/admin/model-pricing');
  expect(csv).toContain('Unresolved');
  expect(csv).toContain('Configured generation margin multiplier');
  expect(csv).toContain("'=IMPORTXML");
  expect(csv).toContain('Unknown price');
  expect(csv.split('\r\n')).toHaveLength(2);
});
