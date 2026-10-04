import { isCloudDeployment } from '@genfeedai/config';
import { RouterPriority } from '@genfeedai/contracts';
import {
  CLOUD_QUALITY_IMAGE_MODEL_KEY,
  LOWEST_COST_IMAGE_MODEL_KEY,
} from '@genfeedai/contracts/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildFirstRunOnboardingImageBody,
  collectFirstRunReferenceIds,
  resolveFirstRunImageRouting,
} from './first-run-image-generation.util';

vi.mock('@genfeedai/config', () => ({
  isCloudDeployment: vi.fn(() => false),
}));

describe('resolveFirstRunImageRouting', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(isCloudDeployment).mockReturnValue(false);
  });

  it('pins the lowest-cost image model outside cloud production', () => {
    vi.mocked(isCloudDeployment).mockReturnValue(false);

    expect(resolveFirstRunImageRouting({ nodeEnv: 'test' })).toEqual({
      autoSelectModel: false,
      model: LOWEST_COST_IMAGE_MODEL_KEY,
      prioritize: RouterPriority.COST,
    });
  });

  it('pins the light Lite model with COST priority on hosted production', () => {
    vi.mocked(isCloudDeployment).mockReturnValue(true);

    expect(resolveFirstRunImageRouting({ nodeEnv: 'production' })).toEqual({
      autoSelectModel: false,
      model: CLOUD_QUALITY_IMAGE_MODEL_KEY,
      prioritize: RouterPriority.COST,
    });
  });
});

describe('collectFirstRunReferenceIds', () => {
  it('returns an empty list when no kit is present', () => {
    expect(collectFirstRunReferenceIds(undefined)).toEqual([]);
    expect(collectFirstRunReferenceIds(null)).toEqual([]);
  });

  it('prefers reference ids, then logo and banner, without duplicates', () => {
    expect(
      collectFirstRunReferenceIds({
        banner: { id: 'banner-1', role: 'banner', url: 'https://cdn/b' },
        logo: { id: 'logo-1', role: 'logo', url: 'https://cdn/l' },
        references: [
          { id: 'ref-1', role: 'reference', url: 'https://cdn/r1' },
          { id: 'logo-1', role: 'reference', url: 'https://cdn/r2' },
        ],
      }),
    ).toEqual(['ref-1', 'logo-1', 'banner-1']);
  });

  it('caps collected ids at the first-run image DTO limit', () => {
    expect(
      collectFirstRunReferenceIds({
        references: Array.from({ length: 12 }, (_, index) => ({
          id: `ref-${index + 1}`,
          role: 'reference' as const,
          url: `https://cdn/r${index + 1}`,
        })),
      }),
    ).toHaveLength(10);
  });
});

describe('buildFirstRunOnboardingImageBody', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(isCloudDeployment).mockReturnValue(false);
  });

  it('never sends a resolution or quality override on hosted production', async () => {
    vi.mocked(isCloudDeployment).mockReturnValue(true);

    const body = await buildFirstRunOnboardingImageBody({
      height: 1024,
      nodeEnv: 'production',
      organizationId: 'org-1',
      prompt: 'first post',
      width: 1024,
    });

    expect(body).toMatchObject({
      height: 1024,
      model: CLOUD_QUALITY_IMAGE_MODEL_KEY,
      prioritize: RouterPriority.COST,
      width: 1024,
    });
    expect(body).not.toHaveProperty('resolution');
    expect(body).not.toHaveProperty('quality');
  });

  it('pins lowest-cost routing and omits references when none resolve', async () => {
    vi.mocked(isCloudDeployment).mockReturnValue(false);

    await expect(
      buildFirstRunOnboardingImageBody({
        height: 1024,
        nodeEnv: 'test',
        organizationId: 'org-1',
        prompt: 'first post',
        width: 1024,
      }),
    ).resolves.toEqual({
      autoSelectModel: false,
      height: 1024,
      model: LOWEST_COST_IMAGE_MODEL_KEY,
      prioritize: RouterPriority.COST,
      prompt: 'first post',
      text: 'first post',
      waitForCompletion: true,
      width: 1024,
    });
  });

  it('attaches brand-kit reference ids and reports kit failures', async () => {
    const onReferenceError = vi.fn();
    const resolveBrandKitAssets = vi
      .fn()
      .mockRejectedValueOnce(new Error('kit down'))
      .mockResolvedValueOnce({
        logo: { id: 'logo-1', role: 'logo', url: 'https://cdn/l' },
        references: [{ id: 'ref-1', role: 'reference', url: 'https://cdn/r' }],
      });

    await expect(
      buildFirstRunOnboardingImageBody({
        brandId: 'brand-1',
        height: 1024,
        onReferenceError,
        organizationId: 'org-1',
        prompt: 'first post',
        resolveBrandKitAssets,
        runId: 'run-1',
        width: 1024,
      }),
    ).resolves.not.toHaveProperty('references');
    expect(onReferenceError).toHaveBeenCalledOnce();

    await expect(
      buildFirstRunOnboardingImageBody({
        brandId: 'brand-1',
        height: 1024,
        organizationId: 'org-1',
        prompt: 'first post',
        resolveBrandKitAssets,
        runId: 'run-1',
        strategyId: 'strategy-1',
        width: 1024,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        references: ['ref-1', 'logo-1'],
        workflowExecutionId: 'run-1',
        agentStrategyId: 'strategy-1',
      }),
    );
  });
});
