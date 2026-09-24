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
      'viral-psychology',
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
      'viral-psychology',
      'acme-tone',
    ]);
    expect(runtimeRequire).toHaveBeenCalledTimes(1);
    expect(runtimeRequire).toHaveBeenCalledWith('/virtual/acme/dist/index.js');
    expect(logger.warn).not.toHaveBeenCalled();
    await expect(service.getActivationReport()).resolves.toEqual({
      builtInPackIds: [
        'core-baseline',
        'platform-x',
        'brand-fidelity',
        'viral-psychology',
      ],
      external: [
        {
          packId: 'acme-tone',
          packVersion: '1.0.0',
          specifier: EXTERNAL_PACK_SPECIFIER,
          state: 'loaded',
        },
      ],
      loadedPackIds: [
        'core-baseline',
        'platform-x',
        'brand-fidelity',
        'viral-psychology',
        'acme-tone',
      ],
    });
  });

  it('fails startup when a configured pack fails while loading', async () => {
    const { logger, service } = createService(EXTERNAL_PACK_SPECIFIER);
    injectRuntimeRequire(
      service,
      createRuntimeRequire(
        () => {
          throw new Error('private module details');
        },
        () => '/virtual/acme/dist/index.js',
      ),
    );
    await expect(service.onModuleInit()).rejects.toThrow('failed activation');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      'private module details',
    );
    await expect(service.listLoadedPackIds()).rejects.toThrow(
      'failed activation',
    );
  });

  it('fails startup when a configured pack cannot be resolved', async () => {
    const { service } = createService('@acme/missing-pack');
    const runtimeRequire = createRuntimeRequire(
      () => ({}),
      () => {
        throw Object.assign(new Error('missing'), { code: 'MODULE_NOT_FOUND' });
      },
    );
    injectRuntimeRequire(service, runtimeRequire);
    await expect(service.onModuleInit()).rejects.toThrow('failed activation');
    expect(runtimeRequire).not.toHaveBeenCalled();
  });

  it('fails startup for an invalid export', async () => {
    const { service } = createService(EXTERNAL_PACK_SPECIFIER);
    injectRuntimeRequire(
      service,
      createRuntimeRequire(
        () => ({ default: { id: 'invalid' } }),
        () => '/virtual/invalid.js',
      ),
    );
    await expect(service.onModuleInit()).rejects.toThrow('failed activation');
  });

  it('accepts a named pack export even when default is unrelated', async () => {
    const { logger, service } = createService(EXTERNAL_PACK_SPECIFIER);
    injectRuntimeRequire(
      service,
      createRuntimeRequire(
        () => ({ default: {}, CONTENT_HARNESS_PACK: EXTERNAL_PACK }),
        () => '/virtual/valid.js',
      ),
    );
    await service.onModuleInit();
    expect(await service.listLoadedPackVersions()).toContainEqual({
      id: 'acme-tone',
      version: '1.0.0',
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain(
      'Sound like Acme.',
    );
  });

  it('rejects an explicitly configured empty package list', async () => {
    const { service } = createService(' , ');
    await expect(service.onModuleInit()).rejects.toThrow(
      'must name at least one package',
    );
  });
});
