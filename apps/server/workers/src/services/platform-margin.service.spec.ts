import { PLATFORM_SETTING_KEY } from '@genfeedai/contracts/constants';
import {
  DEFAULT_GENERATION_MARGIN_MULTIPLIER,
  getRuntimeMarginMultiplier,
  setRuntimeMarginMultiplier,
} from '@genfeedai/pricing';
import type { LoggerService } from '@libs/logger/logger.service';
import { PlatformMarginService } from '@workers/services/platform-margin.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PlatformMarginService', () => {
  const findUnique = vi.fn();
  const prisma = { platformSetting: { findUnique } };
  const logger: Partial<LoggerService> = {
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: PlatformMarginService;

  beforeEach(() => {
    vi.clearAllMocks();
    setRuntimeMarginMultiplier(DEFAULT_GENERATION_MARGIN_MULTIPLIER);
    service = new PlatformMarginService(
      prisma as never,
      logger as LoggerService,
    );
  });

  afterEach(() => {
    setRuntimeMarginMultiplier(DEFAULT_GENERATION_MARGIN_MULTIPLIER);
  });

  it('hydrates the runtime multiplier from the singleton row', async () => {
    findUnique.mockResolvedValue({ marginMultiplierGeneration: 1.4 });

    await expect(service.hydrate()).resolves.toBe(1.4);
    expect(findUnique).toHaveBeenCalledWith({
      where: { key: PLATFORM_SETTING_KEY },
    });
    expect(getRuntimeMarginMultiplier()).toBe(1.4);
  });

  it('falls back to 3.33 when no row exists yet', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.hydrate()).resolves.toBe(
      DEFAULT_GENERATION_MARGIN_MULTIPLIER,
    );
    expect(getRuntimeMarginMultiplier()).toBe(
      DEFAULT_GENERATION_MARGIN_MULTIPLIER,
    );
  });

  it('falls back to 3.33 and warns when the read throws', async () => {
    findUnique.mockRejectedValue(new Error('db down'));

    await expect(service.hydrate()).resolves.toBe(
      DEFAULT_GENERATION_MARGIN_MULTIPLIER,
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(getRuntimeMarginMultiplier()).toBe(
      DEFAULT_GENERATION_MARGIN_MULTIPLIER,
    );
  });
});
