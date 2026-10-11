import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import type { BrandReplicateVisionProvider } from '@api/services/brand-validation/brand-replicate-vision.provider';
import { BrandVisualAnalysisService } from '@api/services/brand-validation/brand-visual-analysis.service';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  parsePlatformFeatureSettings,
} from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

const request = {
  frames: [new Uint8Array([1]), new Uint8Array([2])],
  scope: { brandId: 'brand-a', organizationId: 'org-a' },
};
const identity = { id: 'replicate', model: 'acme/ocr', version: 'v1' };

function setup(isEnabled: boolean) {
  const provider = {
    extractText: vi.fn(async () => ({ provider: identity, texts: ['a', 'b'] })),
  };
  const settings = {
    getFeatureSettings: vi.fn(async () => ({
      ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
      isBrandVisualAnalysisEnabled: isEnabled,
    })),
  };
  const logger = { warn: vi.fn() };
  const service = new BrandVisualAnalysisService(
    settings as unknown as PlatformSettingsService,
    provider as unknown as BrandReplicateVisionProvider,
    logger as unknown as LoggerService,
  );
  return { logger, provider, service, settings };
}

describe('brand visual analysis switch', () => {
  it('is off by default, in the stored defaults and in what an unreadable row yields', () => {
    expect(DEFAULT_PLATFORM_FEATURE_SETTINGS.isBrandVisualAnalysisEnabled).toBe(
      false,
    );
    expect(parsePlatformFeatureSettings({}).isBrandVisualAnalysisEnabled).toBe(
      false,
    );
    expect(
      parsePlatformFeatureSettings({ isBrandVisualAnalysisEnabled: 'true' })
        .isBrandVisualAnalysisEnabled,
    ).toBe(false);
    expect(
      parsePlatformFeatureSettings({ isBrandVisualAnalysisEnabled: true })
        .isBrandVisualAnalysisEnabled,
    ).toBe(true);
  });
});

describe('BrandVisualAnalysisService', () => {
  it('calls no provider while the platform setting is off', async () => {
    const { provider, service } = setup(false);
    expect(await service.extractText(request)).toEqual({ status: 'disabled' });
    expect(provider.extractText).not.toHaveBeenCalled();
  });
  it('reads through the provider once the setting is on', async () => {
    const { provider, service } = setup(true);
    expect(await service.extractText(request)).toEqual({
      provider: identity,
      status: 'read',
      texts: ['a', 'b'],
    });
    expect(provider.extractText).toHaveBeenCalledWith(request);
  });
  it('reads the setting on every call, so turning it off takes effect at once', async () => {
    const { provider, service, settings } = setup(true);
    await service.extractText(request);
    settings.getFeatureSettings.mockResolvedValueOnce({
      ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
      isBrandVisualAnalysisEnabled: false,
    });
    expect(await service.extractText(request)).toEqual({ status: 'disabled' });
    expect(provider.extractText).toHaveBeenCalledTimes(1);
  });
  it('reports unavailable, never a result, when the provider fails', async () => {
    const { logger, provider, service } = setup(true);
    provider.extractText.mockRejectedValueOnce(
      new Error('brand_vision_failed'),
    );
    expect(await service.extractText(request)).toEqual({
      status: 'unavailable',
    });
    expect(logger.warn).toHaveBeenCalled();
  });
  it('reports unavailable when the settings cannot be read', async () => {
    const { provider, service, settings } = setup(true);
    settings.getFeatureSettings.mockRejectedValueOnce(new Error('db down'));
    expect(await service.extractText(request)).toEqual({
      status: 'unavailable',
    });
    expect(provider.extractText).not.toHaveBeenCalled();
  });
  it('reports unavailable when the provider answers for the wrong number of frames', async () => {
    const { provider, service } = setup(true);
    provider.extractText.mockResolvedValueOnce({
      provider: identity,
      texts: ['only one'],
    });
    expect(await service.extractText(request)).toEqual({
      status: 'unavailable',
    });
  });
});
