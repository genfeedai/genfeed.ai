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

  it('does not fall back to workspace source when a resolved pack fails while loading', async () => {
    vi.stubEnv('GENFEED_LICENSE_KEY', '');

    const { logger, service } = createService('@genfeedai/ee-harness');
    const moduleLoadError = Object.assign(
      new Error("Cannot find module 'transitive-package'"),
      { code: 'MODULE_NOT_FOUND' },
    );
    const runtimeRequire = vi.fn(() => {
      throw moduleLoadError;
    }) as unknown as NodeJS.Require;
    runtimeRequire.resolve = vi.fn(() => '/virtual/ee-harness/dist/index.js');

    (
      service as unknown as {
        runtimeRequireContext: { require: NodeJS.Require };
      }
    ).runtimeRequireContext.require = runtimeRequire;

    await expect(service.listLoadedPackIds()).resolves.toEqual([
      'core-baseline',
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      'ContentHarnessService failed to load content harness pack',
      {
        error: "Cannot find module 'transitive-package'",
        specifier: '@genfeedai/ee-harness',
      },
    );
  });
});
