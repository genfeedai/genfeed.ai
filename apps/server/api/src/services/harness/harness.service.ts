import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  BRAND_FIDELITY_HARNESS_PACK,
  CORE_CONTENT_HARNESS_PACK,
  type ContentHarnessActivationReport,
  type ContentHarnessBrief,
  type ContentHarnessInput,
  type ContentHarnessPack,
  type ContentHarnessPackActivation,
  ContentHarnessRegistry,
  composeContentHarnessBrief,
  isContentHarnessPack,
  VIRAL_PSYCHOLOGY_HARNESS_PACK,
  X_PLATFORM_HARNESS_PACK,
} from '@genfeedai/harness';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PackModule = {
  CONTENT_HARNESS_PACK?: unknown;
  default?: unknown;
};

type PackageJsonName = {
  name?: unknown;
};

type RuntimeRequireContext = {
  require: NodeJS.Require;
};

type RegistryLoad = {
  activation: ContentHarnessActivationReport;
  registry: ContentHarnessRegistry;
};

const API_PACKAGE_NAME = '@genfeedai/api';

function runtimeRequireModule(
  requireFn: NodeJS.Require,
  specifier: string,
): PackModule {
  return Reflect.apply(requireFn, undefined, [specifier]) as PackModule;
}

function isApiPackageJsonPath(packageJsonPath: string): boolean {
  if (!existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const packageJson = JSON.parse(
      readFileSync(packageJsonPath, 'utf8'),
    ) as PackageJsonName;

    return packageJson.name === API_PACKAGE_NAME;
  } catch {
    return false;
  }
}

function findApiPackageJsonPath(): string | null {
  const candidates = [
    resolve(process.cwd(), 'api/package.json'),
    resolve(process.cwd(), 'apps/server/api/package.json'),
    resolve(process.cwd(), 'package.json'),
  ];

  return candidates.find(isApiPackageJsonPath) ?? null;
}

function createRuntimeRequireContext(): RuntimeRequireContext {
  const packageJsonPath = findApiPackageJsonPath();

  return {
    require: createRequire(packageJsonPath ?? import.meta.url),
  };
}

function isModuleResolutionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;

  return code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND';
}

function resolveModuleSpecifier(
  requireFn: NodeJS.Require,
  specifier: string,
): string | null {
  try {
    return requireFn.resolve(specifier);
  } catch (error: unknown) {
    if (isModuleResolutionError(error)) {
      return null;
    }

    throw error;
  }
}

@Injectable()
export class ContentHarnessService {
  private readonly constructorName = String(this.constructor.name);
  private packLoadPromise: Promise<RegistryLoad> | null = null;
  private readonly runtimeRequireContext = createRuntimeRequireContext();

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async composeBrief(input: ContentHarnessInput): Promise<ContentHarnessBrief> {
    const registry = await this.getRegistry();
    return await composeContentHarnessBrief(registry, input);
  }

  async listLoadedPackVersions(): Promise<
    Array<{ id: string; version: string }>
  > {
    const registry = await this.getRegistry();
    return registry.list().map(({ id, version }) => ({ id, version }));
  }

  async listLoadedPackIds(): Promise<string[]> {
    const registry = await this.getRegistry();
    return registry.list().map((pack) => pack.id);
  }

  /**
   * Operator diagnostic: which configured external packs actually loaded.
   * Built-in fallback never counts as an activated external pack.
   */
  async getActivationReport(): Promise<ContentHarnessActivationReport> {
    const { activation } = await this.getRegistryLoad();
    return activation;
  }

  private async getRegistry(): Promise<ContentHarnessRegistry> {
    const { registry } = await this.getRegistryLoad();
    return registry;
  }

  private async getRegistryLoad(): Promise<RegistryLoad> {
    if (!this.packLoadPromise) {
      this.packLoadPromise = this.loadRegistry();
    }

    return await this.packLoadPromise;
  }

  private async loadRegistry(): Promise<RegistryLoad> {
    const registry = new ContentHarnessRegistry();
    registry.registerPack(CORE_CONTENT_HARNESS_PACK);
    // X/Twitter craft rules from open-source ranking signals (no-op off-platform).
    registry.registerPack(X_PLATFORM_HARNESS_PACK);
    // Stricter brand-fidelity / anti-genericity directives.
    registry.registerPack(BRAND_FIDELITY_HARNESS_PACK);
    // Demand -> hook -> retention -> conversion craft layer (platform-agnostic).
    registry.registerPack(VIRAL_PSYCHOLOGY_HARNESS_PACK);
    const builtInPackIds = registry.list().map((pack) => pack.id);

    const external: ContentHarnessPackActivation[] = [];
    for (const specifier of this.getExternalPackSpecifiers()) {
      const result = this.loadPackFromModuleSpecifier(specifier);
      external.push(result.activation);
      if (result.pack) {
        registry.registerPack(result.pack);
      }
    }

    const activation: ContentHarnessActivationReport = {
      builtInPackIds,
      external,
      loadedPackIds: registry.list().map((pack) => pack.id),
    };

    if (external.some((item) => item.state !== 'loaded')) {
      this.logger.warn(
        `${this.constructorName} external content harness packs not activated`,
        { external },
      );
    }

    this.logger.log(`${this.constructorName} loaded content harness packs`, {
      external,
      packIds: activation.loadedPackIds,
    });

    return { activation, registry };
  }

  private getExternalPackSpecifiers(): string[] {
    const value = this.configService.get('CONTENT_HARNESS_PACKAGES');
    if (!value) {
      return [];
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter(
        (item, index, array) =>
          item.length > 0 && array.indexOf(item) === index,
      );
  }

  private loadPackFromModuleSpecifier(specifier: string): {
    activation: ContentHarnessPackActivation;
    pack: ContentHarnessPack | null;
  } {
    let resolvedSpecifier: string | null;
    try {
      resolvedSpecifier = resolveModuleSpecifier(
        this.runtimeRequireContext.require,
        specifier,
      );
    } catch (error: unknown) {
      return this.failedActivation(specifier, 'load_failed', error);
    }

    if (!resolvedSpecifier) {
      return this.failedActivation(specifier, 'unresolvable');
    }

    try {
      const imported = runtimeRequireModule(
        this.runtimeRequireContext.require,
        resolvedSpecifier,
      );
      const candidate = imported.default ?? imported.CONTENT_HARNESS_PACK;

      if (!isContentHarnessPack(candidate)) {
        return this.failedActivation(specifier, 'invalid');
      }

      return {
        activation: {
          packId: candidate.id,
          packVersion: candidate.version,
          specifier,
          state: 'loaded',
        },
        pack: candidate,
      };
    } catch (error: unknown) {
      return this.failedActivation(specifier, 'load_failed', error);
    }
  }

  private failedActivation(
    specifier: string,
    state: Exclude<ContentHarnessPackActivation['state'], 'loaded'>,
    error?: unknown,
  ): { activation: ContentHarnessPackActivation; pack: null } {
    return {
      activation: {
        ...(error
          ? { error: error instanceof Error ? error.message : 'Unknown error' }
          : {}),
        specifier,
        state,
      },
      pack: null,
    };
  }
}
