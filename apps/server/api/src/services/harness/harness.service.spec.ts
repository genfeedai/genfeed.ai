import { ContentHarnessService } from '@api/services/harness/harness.service';
import {
  type ContentHarnessContribution,
  type ContentHarnessInput,
  type ContentHarnessPack,
  ContentHarnessRegistry,
} from '@genfeedai/harness';
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

function serviceWithPacks(packs: readonly ContentHarnessPack[]) {
  const { service } = createService();
  const registry = new ContentHarnessRegistry();
  for (const pack of packs) registry.registerPack(pack);
  const getRegistry = vi
    .spyOn(
      service as unknown as { getRegistry(): Promise<ContentHarnessRegistry> },
      'getRegistry',
    )
    .mockResolvedValue(registry);
  const list = vi.spyOn(registry, 'list');
  return { service, registry, getRegistry, list };
}

describe('composeBriefLayers', () => {
  const input: ContentHarnessInput = {
    organizationId: 'org',
    intent: { contentType: 'post', objective: 'engagement' },
  };

  it('awaits each sync/async contribution once in registry order with exact input and result references', async () => {
    const events: string[] = [];
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstResult: ContentHarnessContribution = {
      styleDirectives: ['Exact first'],
    };
    const secondResult: ContentHarnessContribution = {
      guardrails: ['Exact second'],
    };
    const first = vi.fn(async (supplied: ContentHarnessInput) => {
      expect(supplied).toBe(input);
      events.push('first start');
      await pending;
      events.push('first finish');
      return firstResult;
    });
    const second = vi.fn((supplied: ContentHarnessInput) => {
      expect(supplied).toBe(input);
      events.push('second');
      return secondResult;
    });
    const packs = [
      { id: 'first', version: '1.2.3', contribute: first },
      { id: 'second', version: 'opaque internal version', contribute: second },
    ];
    const { service, getRegistry, list } = serviceWithPacks(packs);
    const legacy = vi.spyOn(service, 'composeBrief');
    const result = service.composeBriefLayers(input);
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['first start']);
    expect(second).not.toHaveBeenCalled();
    release?.();
    const layers = await result;
    expect(events).toEqual(['first start', 'first finish', 'second']);
    expect(getRegistry).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledExactlyOnceWith(input);
    expect(second).toHaveBeenCalledExactlyOnceWith(input);
    expect(layers[0][1]).toBe(firstResult);
    expect(layers[1][1]).toBe(secondResult);
    expect(layers.map(([metadata]) => metadata)).toEqual([
      { id: 'first', version: '1.2.3' },
      { id: 'second', version: 'opaque internal version' },
    ]);
    expect(legacy).not.toHaveBeenCalled();
  });

  it('copies metadata before contribution mutations and keeps opaque versions and empty entries', async () => {
    const empty: ContentHarnessContribution = {};
    const mutated: ContentHarnessPack = {
      id: 'mutable',
      version: '  2.0 beta  ',
    };
    mutated.contribute = vi.fn(() => {
      mutated.id = 'changed';
      mutated.version = 'changed';
      return empty;
    });
    const { service } = serviceWithPacks([
      { id: 'absent', version: 'opaque' },
      mutated,
      { id: 'empty', version: '1.0.0', contribute: () => empty },
    ]);
    const layers = await service.composeBriefLayers(input);
    expect(layers).toEqual([
      [{ id: 'absent', version: 'opaque' }, {}],
      [{ id: 'mutable', version: '  2.0 beta  ' }, {}],
      [{ id: 'empty', version: '1.0.0' }, {}],
    ]);
    expect(layers[1][0]).not.toBe(mutated);
    expect(layers[1][1]).toBe(empty);
    expect(layers[2][1]).toBe(empty);
    expect(layers[0][1]).not.toBe(empty);
    const absentMetadata = layers[0][0];
    const next = await service.composeBriefLayers(input);
    expect(next[0][0]).not.toBe(absentMetadata);
    expect(next[0][1]).not.toBe(layers[0][1]);
  });

  it.each(['throw', 'reject'])(
    'propagates contribution %s unchanged and stops later packs',
    async (mode) => {
      const error = new Error('Exact failure');
      const earlier = vi.fn(() => ({}));
      const later = vi.fn(() => ({}));
      const failed = vi.fn(() => {
        if (mode === 'throw') throw error;
        return Promise.reject(error);
      });
      const { service } = serviceWithPacks([
        { id: 'earlier', version: '1', contribute: earlier },
        { id: 'failed', version: '1', contribute: failed },
        { id: 'later', version: '1', contribute: later },
      ]);
      await expect(service.composeBriefLayers(input)).rejects.toBe(error);
      expect(earlier).toHaveBeenCalledTimes(1);
      expect(failed).toHaveBeenCalledTimes(1);
      expect(later).not.toHaveBeenCalled();
    },
  );

  it('propagates registry rejection unchanged before listing or contributing', async () => {
    const contribute = vi.fn(() => ({}));
    const { service, getRegistry, list } = serviceWithPacks([
      { id: 'pack', version: '1', contribute },
    ]);
    const error = new Error('Registry failed');
    getRegistry.mockRejectedValue(error);
    await expect(service.composeBriefLayers(input)).rejects.toBe(error);
    expect(getRegistry).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();
    expect(contribute).not.toHaveBeenCalled();
  });

  it('leaves legacy merged composition and loaded version listing unchanged', async () => {
    const contribution = { styleDirectives: ['Custom craft'] };
    const contribute = vi.fn(() => contribution);
    const { service } = serviceWithPacks([
      { id: 'pack', version: '  opaque version  ', contribute },
    ]);
    const before = await service.composeBrief(input);
    const layers = await service.composeBriefLayers(input);
    const after = await service.composeBrief(input);
    expect(after).toEqual(before);
    expect(before.styleDirectives).toContain('Custom craft');
    expect(layers[0][1]).toBe(contribution);
    await expect(service.listLoadedPackVersions()).resolves.toEqual([
      { id: 'pack', version: '  opaque version  ' },
    ]);
  });
});
