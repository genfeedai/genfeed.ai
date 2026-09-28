import { PublicPlatformFlagsController } from '@api/endpoints/public/controllers/platform-flags/public.platform-flags.controller';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  DEFAULT_PLATFORM_FLAGS,
} from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';

describe('PublicPlatformFlagsController (#5468)', () => {
  it('returns only the module and feature flags', async () => {
    const flags = { ...DEFAULT_PLATFORM_FLAGS, studio: false };
    const controller = new PublicPlatformFlagsController({
      getFeatureSettings: vi.fn(async () => ({
        ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
        flags,
      })),
    } as never);

    await expect(controller.getFlags()).resolves.toEqual(flags);
  });
});
