import { ConfigService } from '@api/config/config.service';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import { LoggerService } from '@libs/logger/logger.service';

function createService(contentHarnessPackages?: string) {
  const configService = {
    get: vi.fn((key: string) =>
      key === 'CONTENT_HARNESS_PACKAGES' ? contentHarnessPackages : undefined,
    ),
  };
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
  };

  return {
    logger,
    service: new ContentHarnessService(
      configService as unknown as ConfigService,
      logger as unknown as LoggerService,
    ),
  };
}

describe('ContentHarnessService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('loads the core harness pack by default', async () => {
    vi.stubEnv('GENFEED_LICENSE_KEY', '');

    const { service } = createService();

    await expect(service.listLoadedPackIds()).resolves.toEqual([
      'core-baseline',
    ]);
  });

  it('loads configured workspace packs through the runtime resolver', async () => {
    vi.stubEnv('GENFEED_LICENSE_KEY', '');

    const { logger, service } = createService(
      '@genfeedai/ee-harness, @genfeedai/ee-harness',
    );

    await expect(service.listLoadedPackIds()).resolves.toEqual([
      'core-baseline',
      'ee-brand-fidelity',
    ]);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
