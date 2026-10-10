import { PublicPlatformFlagsController } from '@api/endpoints/public/controllers/platform-flags/public.platform-flags.controller';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  DEFAULT_PLATFORM_FLAGS,
} from '@genfeedai/contracts/constants';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

describe('PublicPlatformFlagsController (#5468)', () => {
  it('returns only the module and feature flags', async () => {
    const flags = { ...DEFAULT_PLATFORM_FLAGS, studio: false };
    const controller = new PublicPlatformFlagsController({
      getFeatureSettingsState: vi.fn(async () => ({
        isResolved: true,
        settings: { ...DEFAULT_PLATFORM_FEATURE_SETTINGS, flags },
      })),
    } as never);

    await expect(controller.getFlags()).resolves.toEqual(flags);
  });
  it('rejects unresolved settings rather than publishing guessed flags', async () => {
    const controller = new PublicPlatformFlagsController({
      getFeatureSettingsState: vi.fn(async () => ({
        isResolved: false,
        settings: DEFAULT_PLATFORM_FEATURE_SETTINGS,
      })),
    } as never);

    await expect(controller.getFlags()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
