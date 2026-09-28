import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { FeatureFlagGuard } from '@api/feature-flag/feature-flag.guard';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  DEFAULT_PLATFORM_FLAGS,
} from '@genfeedai/contracts/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

@FeatureFlag('studio')
class StudioController {
  list() {}
}

class OpenController {
  @FeatureFlag('reply_bot')
  gated() {}

  open() {}
}

function createContext(
  controller: new () => object,
  handlerName: string,
  request: Record<string, unknown> = {},
) {
  return {
    getClass: () => controller,
    getHandler: () =>
      (controller.prototype as Record<string, unknown>)[handlerName],
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

function createGuard(flags: Partial<typeof DEFAULT_PLATFORM_FLAGS> = {}) {
  const getFeatureSettings = vi.fn(async () => ({
    ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
    flags: { ...DEFAULT_PLATFORM_FLAGS, ...flags },
  }));
  const guard = new FeatureFlagGuard(new Reflector(), {
    getFeatureSettings,
  } as never);
  return { getFeatureSettings, guard };
}

describe('FeatureFlagGuard (#5468)', () => {
  it('lets a route without a flag through without reading settings', async () => {
    const { getFeatureSettings, guard } = createGuard({ studio: false });

    await expect(
      guard.canActivate(createContext(OpenController, 'open') as never),
    ).resolves.toBe(true);
    expect(getFeatureSettings).not.toHaveBeenCalled();
  });

  it('lets a flagged controller through while its flag is on', async () => {
    const { guard } = createGuard();

    await expect(
      guard.canActivate(createContext(StudioController, 'list') as never),
    ).resolves.toBe(true);
  });

  it('answers 404 on a controller whose module is off', async () => {
    const { guard } = createGuard({ studio: false });

    await expect(
      guard.canActivate(createContext(StudioController, 'list') as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 on a flagged handler whose feature is off', async () => {
    const { guard } = createGuard({ reply_bot: false });

    await expect(
      guard.canActivate(createContext(OpenController, 'gated') as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets a superadmin inspect a module that is off', async () => {
    const { guard } = createGuard({ studio: false });

    await expect(
      guard.canActivate(
        createContext(StudioController, 'list', {
          user: { isSuperAdmin: true },
        }) as never,
      ),
    ).resolves.toBe(true);
  });
});
