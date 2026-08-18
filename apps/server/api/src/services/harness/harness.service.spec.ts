import { ContentHarnessService } from '@api/services/harness/harness.service';
import type { ContentHarnessPack } from '@genfeedai/harness';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';

const EXTERNAL_PACK_SPECIFIER = '@acme/harness-pack';

const EXTERNAL_PACK: ContentHarnessPack = {
  capabilities: ['acme-tone'],
  contribute: () => ({ styleDirectives: ['Sound like Acme.'] }),
  description: 'External pack loaded by package name.',
  id: 'acme-tone',
  version: '1.0.0',
};

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

/**
 * Builds a mocked `require` whose `resolve` carries the full
 * `NodeJS.RequireResolve` shape (including `paths`) so the fixture typechecks
 * without widening casts.
 */
function createRuntimeRequire(
  load: () => unknown,
  resolve: () => string,
): NodeJS.Require {
  const runtimeRequire = vi.fn(load) as unknown as NodeJS.Require;
  runtimeRequire.resolve = Object.assign(vi.fn(resolve), {
    paths: vi.fn(() => null),
  });
  return runtimeRequire;
}

function injectRuntimeRequire(
  service: ContentHarnessService,
  runtimeRequire: NodeJS.Require,
): void {
  (
    service as unknown as {
      runtimeRequireContext: { require: NodeJS.Require };
    }
  ).runtimeRequireContext.require = runtimeRequire;
}

describe('ContentHarnessService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('loads the built-in harness packs by default', async () => {
    const { service } = createService();

    await expect(service.listLoadedPackIds()).resolves.toEqual([
      'core-baseline',
      'platform-x',
      'brand-fidelity',
    ]);
  });

  it('loads configured external packs once through the runtime resolver', async () => {
    const { logger, service } = createService(
      `${EXTERNAL_PACK_SPECIFIER}, ${EXTERNAL_PACK_SPECIFIER}`,
    );
    const runtimeRequire = createRuntimeRequire(
      () => ({ default: EXTERNAL_PACK }),
      () => '/virtual/acme/dist/index.js',
    );
    injectRuntimeRequire(service, runtimeRequire);

    await expect(service.listLoadedPackIds()).resolves.toEqual([
      'core-baseline',
      'platform-x',
      'brand-fidelity',
      'acme-tone',
    ]);
    expect(runtimeRequire).toHaveBeenCalledTimes(1);
    expect(runtimeRequire).toHaveBeenCalledWith('/virtual/acme/dist/index.js');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns and skips a resolved pack that fails while loading', async () => {
    const { logger, service } = createService(EXTERNAL_PACK_SPECIFIER);
    const moduleLoadError = Object.assign(
      new Error("Cannot find module 'transitive-package'"),
      { code: 'MODULE_NOT_FOUND' },
    );
    const runtimeRequire = createRuntimeRequire(
      () => {
        throw moduleLoadError;
      },
      () => '/virtual/acme/dist/index.js',
    );
    injectRuntimeRequire(service, runtimeRequire);

    await expect(service.listLoadedPackIds()).resolves.toEqual([
      'core-baseline',
      'platform-x',
      'brand-fidelity',
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      'ContentHarnessService failed to load content harness pack',
      {
        error: "Cannot find module 'transitive-package'",
        specifier: EXTERNAL_PACK_SPECIFIER,
      },
    );
  });

  it('warns and skips an unresolvable pack specifier', async () => {
    const { logger, service } = createService('@acme/missing-pack');
    const notFound = Object.assign(
      new Error("Cannot find module '@acme/missing-pack'"),
      { code: 'MODULE_NOT_FOUND' },
    );
    const runtimeRequire = createRuntimeRequire(
      () => {
        throw notFound;
      },
      () => {
        throw notFound;
      },
    );
    injectRuntimeRequire(service, runtimeRequire);

    await expect(service.listLoadedPackIds()).resolves.toEqual([
      'core-baseline',
      'platform-x',
      'brand-fidelity',
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      'ContentHarnessService failed to load content harness pack',
      {
        error: "Cannot find module '@acme/missing-pack'",
        specifier: '@acme/missing-pack',
      },
    );
  });
});
