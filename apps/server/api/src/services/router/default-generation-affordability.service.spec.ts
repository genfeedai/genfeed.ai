import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { DefaultGenerationAffordabilityService } from '@api/services/router/default-generation-affordability.service';
import { RouterService } from '@api/services/router/router.service';
import { ModelCategory } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const billing = vi.hoisted(() => ({ isEnabled: true }));

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => billing.isEnabled,
}));

describe('DefaultGenerationAffordabilityService', () => {
  const resolveModelKey = vi.fn();
  const quoteByKey = vi.fn();
  const warn = vi.fn();
  const service = new DefaultGenerationAffordabilityService(
    { resolveModelKey } as unknown as RouterService,
    { quoteByKey } as unknown as ModelCreditQuoteService,
    { warn } as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    billing.isEnabled = true;
    resolveModelKey.mockResolvedValue({
      key: 'registry-default-image',
      source: 'registry-default',
    });
    quoteByKey.mockResolvedValue(12);
  });

  it('prices one image on the default model the registry resolves for the organization', async () => {
    await expect(
      service.getDefaultImageCredits('org-1', 'org-default-image'),
    ).resolves.toBe(12);

    expect(resolveModelKey).toHaveBeenCalledWith({
      candidates: ['org-default-image'],
      category: ModelCategory.IMAGE,
      organizationId: 'org-1',
    });
    expect(quoteByKey).toHaveBeenCalledWith('registry-default-image', {
      organizationId: 'org-1',
      outputs: 1,
    });
  });

  it('can afford a generation when the balance covers one default image', async () => {
    await expect(
      service.canAffordDefaultGeneration({
        balance: 12,
        organizationId: 'org-1',
      }),
    ).resolves.toBe(true);
  });

  it('cannot afford a generation when credits are left but below the default image price', async () => {
    await expect(
      service.canAffordDefaultGeneration({
        balance: 11,
        organizationId: 'org-1',
      }),
    ).resolves.toBe(false);
  });

  it('cannot afford anything with an empty wallet, without pricing a model', async () => {
    await expect(
      service.canAffordDefaultGeneration({
        balance: 0,
        organizationId: 'org-1',
      }),
    ).resolves.toBe(false);
    expect(resolveModelKey).not.toHaveBeenCalled();
  });

  it('treats any credits left as affordable when the default price cannot be resolved', async () => {
    quoteByKey.mockRejectedValue(
      new ServiceUnavailableException('Exact model tariff is unavailable'),
    );

    await expect(
      service.canAffordDefaultGeneration({
        balance: 1,
        organizationId: 'org-1',
      }),
    ).resolves.toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'Default image price is unavailable',
      expect.objectContaining({ organizationId: 'org-1' }),
    );
  });

  it('always affords generation on deployments without organization billing', async () => {
    billing.isEnabled = false;

    await expect(
      service.canAffordDefaultGeneration({
        balance: 0,
        organizationId: 'org-1',
      }),
    ).resolves.toBe(true);
    expect(quoteByKey).not.toHaveBeenCalled();
  });
});
