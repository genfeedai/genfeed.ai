import { ConfigService } from '@api/config/config.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

interface SkillRegistryEntry {
  slug: string;
  name: string;
  description: string;
  version: string;
  s3Key: string;
  category: string;
  checksum?: string;
}

interface CdnSkillRegistry {
  skills: SkillRegistryEntry[];
  bundle?: { price: number; stripePriceId?: string; name: string };
  bundlePrice?: number;
  updatedAt: string;
}

interface SkillRegistry {
  skills: SkillRegistryEntry[];
  bundlePrice: number;
  updatedAt: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class SkillRegistryService {
  private readonly constructorName: string = String(this.constructor.name);
  private cachedRegistry: SkillRegistry | null = null;
  private cachedBundleStripePriceId: string | undefined;
  private cachedBundlePriceCents: number | undefined;
  private cacheExpiresAt = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  @HandleErrors('get skill registry', 'skills-pro')
  async getRegistry(): Promise<SkillRegistry> {
    if (this.cachedRegistry && Date.now() < this.cacheExpiresAt) {
      return this.cachedRegistry;
    }

    const cdnUrl = this.configService.get('GENFEEDAI_CDN_URL');
    const registryUrl = `${cdnUrl}/skills/registry.json`;

    this.loggerService.log(`${this.constructorName} fetching registry`, {
      url: registryUrl,
    });

    const response = await fetch(registryUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch skill registry: ${response.status} ${response.statusText}`,
      );
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

    this.loggerService.log(`${this.constructorName} registry cached`, {
      skillCount: registry.skills.length,
    });

    return registry;
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
}
