import { ModelCatalogSeedService } from '@api/seeds/model-catalog-seed.service';
import { PlatformTemplateSeedService } from '@api/seeds/platform-template-seed.service';
import {
  type ReferenceDataDomainName,
  type ReferenceDataDomainSummary,
  type ReferenceDataSyncReport,
} from '@api/seeds/reference-data-sync.types';
import { seedReviewedProviderRates } from '@api/seeds/reviewed-provider-rates-seed';
import { SkillCatalogSeedService } from '@api/seeds/skill-catalog-seed.service';
import { StudioElementSeedService } from '@api/seeds/studio-element-seed.service';
import { StudioPresetSeedService } from '@api/seeds/studio-preset-seed.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ReferenceDataSyncService {
  private readonly context = 'ReferenceDataSyncService';

  constructor(
    private readonly logger: LoggerService,
    private readonly models: ModelCatalogSeedService,
    private readonly platformTemplates: PlatformTemplateSeedService,
    private readonly prisma: PrismaService,
    private readonly skills: SkillCatalogSeedService,
    private readonly studioElements: StudioElementSeedService,
    private readonly studioPresets: StudioPresetSeedService,
  ) {}

  async reconcile(): Promise<ReferenceDataSyncReport> {
    const domains: ReferenceDataDomainSummary[] = [];

    domains.push(
      await this.runDomain('models', async () => {
        const result = await this.models.reconcileCatalog();
        return {
          failed: [],
          unchanged: result.unchanged,
          written: result.written,
        };
      }),
    );

    domains.push(
      await this.runDomain('rates', async () => {
        const written = await seedReviewedProviderRates(
          this.prisma,
          undefined,
          {
            warn: (message) => this.logger.warn(message, this.context),
          },
        );
        return { failed: [], unchanged: 0, written };
      }),
    );

    domains.push(
      await this.runDomain('skills', async () => {
        const result = await this.skills.reconcileCatalog();
        await this.skills.backfillOrganizations();
        return {
          failed: [],
          unchanged: result.skipped,
          written: result.inserted + result.updated,
        };
      }),
    );

    domains.push(
      await this.runDomain('platform-templates', async () => {
        const result = await this.platformTemplates.reconcileCatalog();
        return {
          failed: [],
          unchanged: result.unchanged,
          written: result.written,
        };
      }),
    );

    domains.push(
      await this.runDomain('studio-presets', async () => {
        const result = await this.studioPresets.reconcileCatalog();
        return {
          failed: [],
          unchanged: result.unchanged,
          written: result.written,
        };
      }),
    );

    domains.push(
      await this.runDomain('studio-elements', async () => {
        const result = await this.studioElements.reconcileCatalog();
        return {
          failed: [],
          unchanged: result.unchanged,
          written: result.written,
        };
      }),
    );

    const failedDomains = domains
      .filter((domain) => domain.failed.length > 0)
      .map((domain) => domain.domain);

    return { domains, failedDomains };
  }

  private async runDomain(
    domain: ReferenceDataDomainName,
    run: () => Promise<
      Pick<ReferenceDataDomainSummary, 'failed' | 'unchanged' | 'written'>
    >,
  ): Promise<ReferenceDataDomainSummary> {
    try {
      const result = await run();
      const summary: ReferenceDataDomainSummary = { domain, ...result };
      this.logSummary(summary);
      return summary;
    } catch (error) {
      const failed = this.failedKeys(error);
      const summary: ReferenceDataDomainSummary = {
        domain,
        failed,
        unchanged: 0,
        written: 0,
      };
      this.logger.error(
        `Reference-data domain failed: ${domain} (${failed.join(', ')})`,
        error instanceof Error ? error : new Error(String(error)),
        this.context,
      );
      this.logSummary(summary);
      return summary;
    }
  }

  private failedKeys(error: unknown): string[] {
    if (!(error instanceof Error)) return ['unknown'];
    const named = error.message.match(
      /failed for(?: all \d+ entries)?: (.+)$/u,
    );
    if (named?.[1]) {
      return named[1].split(', ').filter(Boolean);
    }
    return [error.message];
  }

  private logSummary(summary: ReferenceDataDomainSummary): void {
    this.logger.log(
      `reference-data ${summary.domain}: written=${summary.written} unchanged=${summary.unchanged} failed=${summary.failed.length}${
        summary.failed.length > 0 ? ` (${summary.failed.join(', ')})` : ''
      }`,
      this.context,
    );
  }
}
