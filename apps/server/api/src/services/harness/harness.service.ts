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

@Injectable()
export class ContentHarnessService {
  private readonly constructorName = String(this.constructor.name);
  private packLoadPromise: Promise<ContentHarnessRegistry> | null = null;

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
      const imported = (await import(specifier)) as PackModule;
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
}
