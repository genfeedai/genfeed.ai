import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import type { BrandReplicateVisionProvider } from '@api/services/brand-validation/brand-replicate-vision.provider';
import { BrandVisualAnalysisService } from '@api/services/brand-validation/brand-visual-analysis.service';
import type { BrandDetectedRegion } from '@api/services/brand-validation/brand-visual-analysis.types';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
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

function setup(isEnabled: boolean, isOrganizationEnabled = true) {
  const organizationSetting = {
    findFirst: vi.fn(
      async (): Promise<{ isBrandVisionChecksEnabled: boolean } | null> => ({
        isBrandVisionChecksEnabled: isOrganizationEnabled,
      }),
    ),
  };
  const provider = {
    detectRegions: vi.fn(async () => ({
      frames: [[], []] as BrandDetectedRegion[][],
      provider: identity,
    })),
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
    { organizationSetting } as unknown as PrismaService,
  );
  return { logger, organizationSetting, provider, service, settings };
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

describe('BrandVisualAnalysisService detection', () => {
  it('calls no detector while the platform setting is off', async () => {
    const { provider, service } = setup(false);
    expect(await service.detectRegions({ ...request, query: 'logo' })).toEqual({
      status: 'disabled',
    });
    expect(provider.detectRegions).not.toHaveBeenCalled();
  });
  it('detects through the provider once the setting is on', async () => {
    const { provider, service } = setup(true);
    expect(await service.detectRegions({ ...request, query: 'logo' })).toEqual({
      frames: [[], []],
      provider: identity,
      status: 'detected',
    });
    expect(provider.detectRegions).toHaveBeenCalledTimes(1);
  });
  it('reports unavailable when the provider fails or answers for the wrong number of frames', async () => {
    const failing = setup(true);
    failing.provider.detectRegions.mockRejectedValueOnce(new Error('boom'));
    expect(
      await failing.service.detectRegions({ ...request, query: 'logo' }),
    ).toEqual({ status: 'unavailable' });
    const short = setup(true);
    short.provider.detectRegions.mockResolvedValueOnce({
      frames: [[]],
      provider: identity,
    });
    expect(
      await short.service.detectRegions({ ...request, query: 'logo' }),
    ).toEqual({ status: 'unavailable' });
  });
});

describe('BrandVisualAnalysisService organization setting (#6727)', () => {
  it('is off in the absence of a stored row', async () => {
    const missing = setup(true);
    missing.organizationSetting.findFirst.mockResolvedValue(null);
    expect(await missing.service.extractText(request)).toEqual({
      status: 'disabled',
    });
    expect(missing.provider.extractText).not.toHaveBeenCalled();
  });

  it('calls no provider and stays unknown while the organization has vision checks off', async () => {
    const h = setup(true, false);
    expect(await h.service.extractText(request)).toEqual({
      status: 'disabled',
    });
    expect(
      await h.service.detectRegions({ ...request, query: 'logo' }),
    ).toEqual({ status: 'disabled' });
    expect(h.provider.extractText).not.toHaveBeenCalled();
    expect(h.provider.detectRegions).not.toHaveBeenCalled();
  });

  it('reads the setting of the organization the paid reading is attributed to', async () => {
    const h = setup(true, true);
    await h.service.extractText(request);
    expect(h.organizationSetting.findFirst).toHaveBeenCalledWith({
      select: expect.objectContaining({ isBrandVisionChecksEnabled: true }),
      where: { organizationId: 'org-a' },
    });
    expect(h.provider.extractText).toHaveBeenCalledTimes(1);
  });

  it('lets the platform switch override an organization that turned vision checks on', async () => {
    const h = setup(false, true);
    expect(await h.service.extractText(request)).toEqual({
      status: 'disabled',
    });
    expect(
      await h.service.detectRegions({ ...request, query: 'logo' }),
    ).toEqual({ status: 'disabled' });
    expect(h.provider.extractText).not.toHaveBeenCalled();
    expect(h.provider.detectRegions).not.toHaveBeenCalled();
    // The master kill switch answers alone: the organization is not even read.
    expect(h.organizationSetting.findFirst).not.toHaveBeenCalled();
  });

  it('runs once both switches are on', async () => {
    const h = setup(true, true);
    expect(await h.service.extractText(request)).toMatchObject({
      status: 'read',
    });
    expect(
      await h.service.detectRegions({ ...request, query: 'logo' }),
    ).toMatchObject({ status: 'detected' });
  });

  it('re-reads the organization setting on every call, so turning it off takes effect at once', async () => {
    const h = setup(true, true);
    await h.service.extractText(request);
    h.organizationSetting.findFirst.mockResolvedValueOnce({
      isBrandVisionChecksEnabled: false,
    });
    expect(await h.service.extractText(request)).toEqual({
      status: 'disabled',
    });
    expect(h.provider.extractText).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable when the organization setting cannot be read', async () => {
    const h = setup(true, true);
    h.organizationSetting.findFirst.mockRejectedValueOnce(new Error('db down'));
    expect(await h.service.extractText(request)).toEqual({
      status: 'unavailable',
    });
    expect(h.provider.extractText).not.toHaveBeenCalled();
  });
});
