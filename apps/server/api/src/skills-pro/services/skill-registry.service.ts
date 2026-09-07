import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import type {
  SkillsProRegistryCatalogDto,
  SkillsProRegistryEntryDto,
  SkillsProStorefrontCatalogDto,
  SkillsProStorefrontEntryDto,
} from '@api/skills-pro/contracts/skill-registry.contract';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface SkillRegistryEntry {
  slug: string;
  name: string;
  description: string;
  version: string;
  s3Key: string;
  category: string;
  checksum?: string;
  fileSize?: number;
  price?: number;
}

interface CdnSkillRegistry {
  skills: SkillRegistryEntry[];
  bundle?: { price: number; stripePriceId?: string; name: string };
  bundlePrice?: number;
  updatedAt: string;
}

export interface SkillRegistry {
  skills: SkillRegistryEntry[];
  bundlePrice: number;
  updatedAt: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const NEGATIVE_CACHE_TTL_MS = 60 * 1000; // 1 minute

const EMPTY_REGISTRY: SkillRegistry = {
  bundlePrice: 0,
  skills: [],
  updatedAt: new Date(0).toISOString(),
};

@Injectable()
export class SkillRegistryService {
  private readonly constructorName: string = String(this.constructor.name);
  private cachedRegistry: SkillRegistry | null = null;
  private cachedBundleStripePriceId: string | undefined;
  private cachedBundlePriceCents: number | undefined;
  private cacheExpiresAt = 0;
  private lastFetchFailedAt = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  @HandleErrors('get skill registry', 'skills-pro')
  async getRegistry(): Promise<SkillRegistry> {
    if (this.cachedRegistry && Date.now() < this.cacheExpiresAt) {
      return this.cachedRegistry;
    }

    if (
      !this.cachedRegistry &&
      Date.now() - this.lastFetchFailedAt < NEGATIVE_CACHE_TTL_MS
    ) {
      return EMPTY_REGISTRY;
    }

    const registryUrl = `${this.configService.cdnUrl}/skills/registry.json`;

    this.loggerService.log(`${this.constructorName} fetching registry`, {
      url: registryUrl,
    });

    let response: Response;
    try {
      response = await fetch(registryUrl);
    } catch (error) {
      this.loggerService.warn(
        `${this.constructorName} failed to fetch registry`,
        {
          error: error instanceof Error ? error.message : String(error),
          url: registryUrl,
        },
      );
      return this.handleFetchFailure();
    }

    if (!response.ok) {
      this.loggerService.warn(
        `${this.constructorName} registry fetch returned non-OK response`,
        {
          status: response.status,
          statusText: response.statusText,
          url: registryUrl,
        },
      );
      return this.handleFetchFailure();
    }

    const cdnData = (await response.json()) as CdnSkillRegistry;

    const bundlePriceCents = this.resolveBundlePriceCents(cdnData);
    const registry: SkillRegistry = {
      bundlePrice: this.resolveBundlePriceDollars(cdnData, bundlePriceCents),
      skills: cdnData.skills,
      updatedAt: cdnData.updatedAt,
    };

    this.cachedRegistry = registry;
    this.cachedBundleStripePriceId = cdnData.bundle?.stripePriceId;
    this.cachedBundlePriceCents = bundlePriceCents;
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    this.lastFetchFailedAt = 0;

    this.loggerService.log(`${this.constructorName} registry cached`, {
      skillCount: registry.skills.length,
    });

    return registry;
  }

  private handleFetchFailure(): SkillRegistry {
    this.lastFetchFailedAt = Date.now();
    return this.cachedRegistry ?? EMPTY_REGISTRY;
  }

  async getMetadataRegistry(): Promise<SkillsProRegistryCatalogDto> {
    const registry = await this.getRegistry();

    return {
      bundlePrice: registry.bundlePrice,
      skills: registry.skills.map((skill) => this.toMetadata(skill)),
      updatedAt: registry.updatedAt,
    };
  }

  async getStorefrontCatalog(): Promise<SkillsProStorefrontCatalogDto> {
    const registry = await this.getRegistry();

    return {
      bundlePrice: registry.bundlePrice,
      skills: registry.skills.map((skill) => this.toStorefrontMetadata(skill)),
    };
  }

  async getBundleStripePriceId(): Promise<string | undefined> {
    if (!this.cachedRegistry || Date.now() >= this.cacheExpiresAt) {
      await this.getRegistry();
    }
    return this.cachedBundleStripePriceId;
  }

  async getBundlePriceCents(): Promise<number | undefined> {
    if (!this.cachedRegistry || Date.now() >= this.cacheExpiresAt) {
      await this.getRegistry();
    }
    return this.cachedBundlePriceCents;
  }

  getSkillBySlug(
    registry: SkillRegistry,
    slug: string,
  ): SkillRegistryEntry | undefined {
    return registry.skills.find((s) => s.slug === slug);
  }

  private resolveBundlePriceCents(
    cdnData: CdnSkillRegistry,
  ): number | undefined {
    if (Number.isFinite(cdnData.bundle?.price) && cdnData.bundle?.price) {
      return cdnData.bundle.price;
    }

    if (Number.isFinite(cdnData.bundlePrice) && cdnData.bundlePrice) {
      return Math.round(cdnData.bundlePrice * 100);
    }

    return undefined;
  }

  private resolveBundlePriceDollars(
    cdnData: CdnSkillRegistry,
    bundlePriceCents: number | undefined,
  ): number {
    if (Number.isFinite(cdnData.bundlePrice)) {
      return cdnData.bundlePrice ?? 0;
    }

    return bundlePriceCents ? bundlePriceCents / 100 : 0;
  }

  private toMetadata(skill: SkillRegistryEntry): SkillsProRegistryEntryDto {
    return {
      category: skill.category,
      description: skill.description,
      id: skill.slug,
      name: skill.name,
      slug: skill.slug,
      version: skill.version,
    };
  }

  private toStorefrontMetadata(
    skill: SkillRegistryEntry,
  ): SkillsProStorefrontEntryDto {
    return {
      category: skill.category,
      description: skill.description,
      name: skill.name,
      slug: skill.slug,
    };
  }
}
