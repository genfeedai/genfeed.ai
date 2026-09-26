import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { KnowledgeContentRetrievalService } from '@api/collections/contexts/services/knowledge-content-retrieval.service';
import { KnowledgeSelectionService } from '@api/collections/contexts/services/knowledge-selection.service';
import { resolveKnowledgeMinRelevance } from '@api/collections/contexts/utils/knowledge-source.util';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { resolveOptionalProvider } from '@api/helpers/utils/module-ref/resolve-optional-provider.util';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import {
  buildHarnessInput,
  formatHarnessBrief,
  type PersonaSource,
} from '@api/services/harness/harness-brief.util';
import { brandMemoryHitsToHarnessSources } from '@api/services/harness/harness-context-sources.util';
import type {
  KnowledgeRetrievalFilters,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import {
  type ContentHarnessBrief,
  type ContentKind,
  type ContentObjective,
  type HarnessSourceRecord,
} from '@genfeedai/harness';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export const HARNESS_MEMORY_LIMIT = 5;
export const HARNESS_SELECTED_KNOWLEDGE_LIMIT = 8;
export const HARNESS_MEMORY_MIN_RELEVANCE = 0.65;

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
  /**
   * Explicit Knowledge sources, spaces or purposes for this execution. When
   * set, retrieval is constrained to the selection and the passage budget
   * grows so chosen material is not crowded out by generic memory.
   */
  knowledgeSelection?: KnowledgeSelection;
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
    private readonly knowledgeContentRetrievalService?: KnowledgeContentRetrievalService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
    @Optional()
    private readonly brandOsRevisionsService?: BrandOsRevisionsService,
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

      const brandOsRevisionsService = this.resolveProvider(
        this.brandOsRevisionsService,
        BrandOsRevisionsService,
      );
      const brandOsRevision = await brandOsRevisionsService?.findApproved(
        params.organizationId,
        params.brandId,
      );

      const profile = await harnessProfilesService.resolveContributionForBrand(
        params.organizationId,
        params.brandId,
      );

      const knowledgeFilters = await this.resolveKnowledgeFilters(params);
      const includeMemory =
        params.includeContentMemory ??
        (Boolean(knowledgeFilters) || Boolean(params.topic?.trim()));
      const memorySources =
        includeMemory && params.topic?.trim()
          ? await this.loadBrandMemorySources({
              brandId: params.brandId,
              filters: knowledgeFilters,
              organizationId: params.organizationId,
              topic: params.topic.trim(),
            })
          : [];

      const brief = await this.contentHarnessService.composeBrief(
        buildHarnessInput({
          additionalSources: [
            ...(params.additionalSources ?? []),
            ...memorySources,
          ],
          brand,
          brandOsRevision,
          harnessProfileId: profile?.profileId,
          intent: {
            contentType: params.contentType,
            objective: params.objective ?? 'engagement',
            platform: params.platform,
            topic: params.topic,
          },
          organizationId: params.organizationId,
          persona: params.persona,
          profileContribution: profile?.contribution,
        }),
      );
      // Operator-only receipt: pack IDs and versions, never pack contents.
      this.logger.log(`${this.constructorName} applied content harness packs`, {
        appliedPacks: brief.appliedPacks,
        brandId: params.brandId,
        contentType: params.contentType,
        organizationId: params.organizationId,
      });
      return brief;
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

  formatBrief(brief: ContentHarnessBrief | null | undefined): string {
    return formatHarnessBrief(brief);
  }

  private async resolveKnowledgeFilters(
    params: ResolveHarnessBriefParams,
  ): Promise<KnowledgeRetrievalFilters | undefined> {
    if (!params.knowledgeSelection) {
      return undefined;
    }
    const selectionService = this.resolveProvider(
      undefined,
      KnowledgeSelectionService,
    );
    if (!selectionService) {
      return undefined;
    }
    return selectionService.resolve(
      params.organizationId,
      params.brandId,
      params.knowledgeSelection,
    );
  }

  private async loadBrandMemorySources(params: {
    brandId: string;
    filters?: KnowledgeRetrievalFilters;
    organizationId: string;
    topic: string;
  }): Promise<HarnessSourceRecord[]> {
    const knowledgeContentRetrievalService = this.resolveProvider(
      this.knowledgeContentRetrievalService,
      KnowledgeContentRetrievalService,
    );
    if (!knowledgeContentRetrievalService) {
      return [];
    }

    const limit = params.filters
      ? HARNESS_SELECTED_KNOWLEDGE_LIMIT
      : HARNESS_MEMORY_LIMIT;
    const minRelevance = resolveKnowledgeMinRelevance(
      params.filters?.knowledgeSourceIds,
      HARNESS_MEMORY_MIN_RELEVANCE,
    );
    try {
      const hits =
        await knowledgeContentRetrievalService.retrieveBrandContentMemory({
          brandId: params.brandId,
          limit,
          minRelevance,
          organizationId: params.organizationId,
          query: params.topic,
          ...(params.filters ?? {}),
        });
      return brandMemoryHitsToHarnessSources(hits, {
        limit,
        minRelevance,
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
    return resolveOptionalProvider(this.moduleRef, token);
  }
}
