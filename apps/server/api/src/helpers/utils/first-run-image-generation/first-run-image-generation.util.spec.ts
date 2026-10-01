import { isCloudDeployment } from '@genfeedai/config';
import { RouterPriority } from '@genfeedai/contracts';
import {
  CLOUD_QUALITY_IMAGE_MODEL_KEY,
  LOWEST_COST_IMAGE_MODEL_KEY,
} from '@genfeedai/contracts/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
    vi.stubEnv('NODE_ENV', 'test');
    vi.mocked(isCloudDeployment).mockReturnValue(false);

    expect(resolveFirstRunImageRouting()).toEqual({
      autoSelectModel: false,
      model: LOWEST_COST_IMAGE_MODEL_KEY,
      prioritize: RouterPriority.COST,
    });
  });

  it('pins the cloud quality image model on hosted production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(isCloudDeployment).mockReturnValue(true);

    expect(resolveFirstRunImageRouting()).toEqual({
      autoSelectModel: false,
      model: CLOUD_QUALITY_IMAGE_MODEL_KEY,
      prioritize: RouterPriority.QUALITY,
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
