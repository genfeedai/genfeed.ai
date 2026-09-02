import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import {
  buildHarnessInput,
  formatHarnessBrief,
  type PersonaSource,
} from '@api/services/harness/harness-brief.util';
import { brandMemoryHitsToHarnessSources } from '@api/services/harness/harness-context-sources.util';
import {
  buildMediaPromptFromHarness,
  type ContentHarnessBrief,
  type ContentKind,
  type ContentObjective,
  type HarnessSourceRecord,
} from '@genfeedai/harness';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export type ResolveHarnessBriefParams = {
  /**
   * Extra sources (e.g. caller-supplied audience signals) folded into the
   * brief alongside any retrieved brand content memory. Caller-supplied
   * sources are listed first, memory hits after.
   */
  additionalSources?: HarnessSourceRecord[];
  brandId?: string;
  contentType: ContentKind;
  /**
   * When true (default if topic is set), retrieve brand content memory from
   * Postgres pgvector and fold hits into the brief as sources.
   */
  includeContentMemory?: boolean;
  objective?: ContentObjective;
  organizationId: string;
  persona?: PersonaSource | null;
  platform?: string;
  topic?: string;
};

/**
 * Single entry for generation paths (text, media, ads, quality) that need a
 * brand harness brief without re-implementing compose + profile load.
 *
 * Day-one content memory: Postgres pgvector ContextEntry (HNSW), not a separate
 * vector product. Profile few-shots are always-on; similar winners/library are
 * retrieved when a topic is present.
 */
@Injectable()
export class HarnessGenerationService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly contentHarnessService: ContentHarnessService,
    private readonly logger: LoggerService,
    @Optional()
    private readonly brandsService?: BrandsService,
    @Optional()
    private readonly harnessProfilesService?: HarnessProfilesService,
    @Optional()
    private readonly contextsService?: ContextsService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  async resolveBrief(
    params: ResolveHarnessBriefParams,
  ): Promise<ContentHarnessBrief | null> {
    const brandsService = this.resolveProvider(
      this.brandsService,
      BrandsService,
    );
    const harnessProfilesService = this.resolveProvider(
      this.harnessProfilesService,
      HarnessProfilesService,
    );
    if (!params.brandId || !brandsService || !harnessProfilesService) {
      return null;
    }

    try {
      const brand = await brandsService.findOne({
        id: params.brandId,
        isDeleted: false,
        organizationId: params.organizationId,
      });
      if (!brand) {
        return null;
      }

      const profileContribution =
        await harnessProfilesService.buildContributionForBrand(
          params.organizationId,
          params.brandId,
        );

      const includeMemory =
        params.includeContentMemory ?? Boolean(params.topic?.trim());
      const memorySources =
        includeMemory && params.topic?.trim()
          ? await this.loadBrandMemorySources({
              brandId: params.brandId,
              organizationId: params.organizationId,
              topic: params.topic.trim(),
            })
          : [];

      return await this.contentHarnessService.composeBrief(
        buildHarnessInput({
          additionalSources: [
            ...(params.additionalSources ?? []),
            ...memorySources,
          ],
          brand,
          intent: {
            contentType: params.contentType,
            objective: params.objective ?? 'engagement',
            platform: params.platform,
            topic: params.topic,
          },
          organizationId: params.organizationId,
          persona: params.persona,
          profileContribution: profileContribution ?? undefined,
        }),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} failed to resolve harness brief`,
        {
          brandId: params.brandId,
          error: error instanceof Error ? error.message : 'unknown',
          organizationId: params.organizationId,
        },
      );
      return null;
    }
  }

  async applyToMediaPrompt(params: {
    brandId?: string;
    contentType: ContentKind;
    organizationId: string;
    platform?: string;
    prompt: string;
    topic?: string;
  }): Promise<string> {
    const brief = await this.resolveBrief({
      brandId: params.brandId,
      contentType: params.contentType,
      includeContentMemory: true,
      organizationId: params.organizationId,
      platform: params.platform,
      topic: params.topic ?? params.prompt.slice(0, 200),
    });
    return buildMediaPromptFromHarness(params.prompt, brief);
  }

  formatBrief(brief: ContentHarnessBrief | null | undefined): string {
    return formatHarnessBrief(brief);
  }

  private async loadBrandMemorySources(params: {
    brandId: string;
    organizationId: string;
    topic: string;
  }): Promise<HarnessSourceRecord[]> {
    const contextsService = this.resolveProvider(
      this.contextsService,
      ContextsService,
    );
    if (!contextsService) {
      return [];
    }

    try {
      const hits = await contextsService.retrieveBrandContentMemory({
        brandId: params.brandId,
        limit: 5,
        minRelevance: 0.65,
        organizationId: params.organizationId,
        query: params.topic,
      });
      return brandMemoryHitsToHarnessSources(hits, {
        limit: 5,
        minRelevance: 0.65,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} brand content memory retrieval failed`,
        {
          brandId: params.brandId,
          error: error instanceof Error ? error.message : 'unknown',
          organizationId: params.organizationId,
        },
      );
      return [];
    }
  }

  private resolveProvider<T>(
    direct: T | undefined,
    token: Type<T>,
  ): T | undefined {
    if (direct) {
      return direct;
    }
    try {
      return this.moduleRef?.get(token, { strict: false });
    } catch {
      return undefined;
    }
  }
}
