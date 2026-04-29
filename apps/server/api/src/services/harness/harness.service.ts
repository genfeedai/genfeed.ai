import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { ConfigService } from '@api/config/config.service';
import { isEEEnabled } from '@genfeedai/config';
import {
  CORE_CONTENT_HARNESS_PACK,
  type ContentHarnessBrief,
  type ContentHarnessInput,
  type ContentHarnessPack,
  ContentHarnessRegistry,
  composeContentHarnessBrief,
  isContentHarnessPack,
} from '@genfeedai/harness';
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
  workspaceRoot: string | null;
};

type WorkspacePackPaths = {
  packageJson: string;
  sourceEntry: string;
};

const API_PACKAGE_NAME = '@genfeedai/api';
const WORKSPACE_PACK_PATHS: Record<string, WorkspacePackPaths> = {
  '@genfeedai/ee-harness': {
    packageJson: 'ee/packages/harness/package.json',
    sourceEntry: 'ee/packages/harness/src/index.ts',
  },
};

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
    require: createRequire(packageJsonPath ?? __filename),
    workspaceRoot: packageJsonPath
      ? resolve(dirname(packageJsonPath), '../../..')
      : null,
  };
}

function isMissingRequestedModule(error: unknown, specifier: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND' &&
    error.message.includes(`'${specifier}'`)
  );
}

@Injectable()
export class ContentHarnessService {
  private readonly constructorName = String(this.constructor.name);
  private packLoadPromise: Promise<ContentHarnessRegistry> | null = null;
  private readonly runtimeRequireContext = createRuntimeRequireContext();

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async composeBrief(input: ContentHarnessInput): Promise<ContentHarnessBrief> {
    const registry = await this.getRegistry();
    return await composeContentHarnessBrief(registry, input);
  }

  async listLoadedPackIds(): Promise<string[]> {
    const registry = await this.getRegistry();
    return registry.list().map((pack) => pack.id);
  }

  private async getRegistry(): Promise<ContentHarnessRegistry> {
    if (!this.packLoadPromise) {
      this.packLoadPromise = this.loadRegistry();
    }

    return await this.packLoadPromise;
  }

  private async loadRegistry(): Promise<ContentHarnessRegistry> {
    const registry = new ContentHarnessRegistry();
    registry.registerPack(CORE_CONTENT_HARNESS_PACK);

    if (isEEEnabled()) {
      const eePack = await this.loadPackFromModuleSpecifier(
        '@genfeedai/ee-harness',
      );
      if (eePack) {
        registry.registerPack(eePack);
      }
    }

    for (const specifier of this.getExternalPackSpecifiers()) {
      const pack = await this.loadPackFromModuleSpecifier(specifier);
      if (!pack) {
        continue;
      }
      registry.registerPack(pack);
    }

    this.logger.log(`${this.constructorName} loaded content harness packs`, {
      packIds: registry.list().map((pack) => pack.id),
    });

    return registry;
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

  private async loadPackFromModuleSpecifier(
    specifier: string,
  ): Promise<ContentHarnessPack | null> {
    try {
      const imported = this.loadRuntimePackModule(specifier);
      const candidate = imported.default ?? imported.CONTENT_HARNESS_PACK;

      if (!isContentHarnessPack(candidate)) {
        this.logger.warn(
          `${this.constructorName} ignored invalid content harness pack module`,
          { specifier },
        );
        return null;
      }

      return candidate;
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} failed to load content harness pack`,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          specifier,
        },
      );
      return null;
    }
  }

  private loadRuntimePackModule(specifier: string): PackModule {
    try {
      return this.runtimeRequireContext.require(specifier) as PackModule;
    } catch (error: unknown) {
      const workspacePackPaths = this.getWorkspacePackPaths(specifier);

      if (!workspacePackPaths || !isMissingRequestedModule(error, specifier)) {
        throw error;
      }

      const workspaceRequire = createRequire(workspacePackPaths.packageJson);
      try {
        return workspaceRequire(specifier) as PackModule;
      } catch {
        return workspaceRequire(workspacePackPaths.sourceEntry) as PackModule;
      }
    }
  }

  private getWorkspacePackPaths(specifier: string): WorkspacePackPaths | null {
    const workspacePackPaths = WORKSPACE_PACK_PATHS[specifier];

    if (!workspacePackPaths || !this.runtimeRequireContext.workspaceRoot) {
      return null;
    }

    const packageJsonPath = resolve(
      this.runtimeRequireContext.workspaceRoot,
      workspacePackPaths.packageJson,
    );
    const sourceEntryPath = resolve(
      this.runtimeRequireContext.workspaceRoot,
      workspacePackPaths.sourceEntry,
    );

    return existsSync(packageJsonPath) && existsSync(sourceEntryPath)
      ? { packageJson: packageJsonPath, sourceEntry: sourceEntryPath }
      : null;
  }
}
