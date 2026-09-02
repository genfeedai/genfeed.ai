import {
  type BrandKitSourceBrand,
  computeBrandKitReadiness,
} from '@genfeedai/helpers';
import type { IBrandKitResolvedAssets } from '@genfeedai/interfaces';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { BrandMemoryService } from '@server/collections/brand-memory/services/brand-memory.service';
import { BrandsService } from '@server/collections/brands/services/brands.service';
import { resolveEffectiveBrandAgentConfig } from '@server/collections/brands/utils/brand-agent-config-resolution.util';
import { ContextsService } from '@server/collections/contexts/services/contexts.service';
import { CredentialsService } from '@server/collections/credentials/services/credentials.service';
import { OrganizationSettingsService } from '@server/collections/organization-settings/services/organization-settings.service';
import { SCOPED_CACHE_TAGS } from '@server/common/constants/cache-patterns.constants';
import type {
  AssembleContextParams,
  AssembledBrandContext,
  ContextLayers,
  SystemPromptOptions,
} from '@server/services/agent-context-assembly/interfaces/context-assembly.interface';
import { CacheService } from '@server/services/cache/cache.service';
import { PatternMatcherService } from '@server/services/pattern-matcher/pattern-matcher.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import {
  BRAND_CONTEXT_CHARACTER_BUDGET,
  fitBrandContextToBudget,
} from './brand-context-budget.util';
import { rankByQueryOverlap } from './text-overlap.util';

const DEFAULT_LAYERS: Required<ContextLayers> = {
  brandGuidance: true,
  brandIdentity: true,
  brandMemory: true,
  performancePatterns: false,
  ragContext: true,
  recentPosts: true,
};

const RECENT_POSTS_CANDIDATE_MULTIPLIER = 5;

const CACHE_TTL_BRAND = 300; // 5 min
const CACHE_TTL_MEMORY = 600; // 10 min
const CACHE_TTL_POSTS = 120; // 2 min
const RECENT_POSTS_DAYS = 14;
const RECENT_POSTS_LIMIT = 10;
const MAX_POST_SUMMARY_LENGTH = 200;
const DEFAULT_PRIMARY_COLOR = '#000000';
const DEFAULT_SECONDARY_COLOR = '#FFFFFF';
const DEFAULT_BACKGROUND_COLOR = 'transparent';

type BrandRecord = NonNullable<Awaited<ReturnType<BrandsService['findOne']>>>;
type EffectiveBrandAgentConfig = ReturnType<
  typeof resolveEffectiveBrandAgentConfig
>;

@Injectable()
export class AgentContextAssemblyService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly brandMemoryService: BrandMemoryService,
    private readonly contextsService: ContextsService,
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly loggerService: LoggerService,
    private readonly patternMatcherService: PatternMatcherService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    @Optional()
    private readonly credentialsService: CredentialsService,
  ) {}

  async assembleContext(
    params: AssembleContextParams,
  ): Promise<AssembledBrandContext | null> {
    const layers = { ...DEFAULT_LAYERS, ...params.layers };
    const { organizationId } = params;

    // Layer 1: Brand Identity (required — no brand = no context)
    const brand = await this.cacheService.getOrSet(
      this.cacheService.generateKey(
        'brand-ctx',
        organizationId,
        params.brandId || 'selected',
      ),
      async () => {
        const filter: Record<string, unknown> = {
          isDeleted: false,
          organizationId: organizationId,
        };
        if (params.brandId) {
          filter.id = params.brandId;
        } else {
          filter.isSelected = true;
        }
        return this.brandsService.findOne(filter);
      },
      // The scoped tag lets brand-kit writes bust every brand-ctx variant for
      // the org (per-brand + 'selected') without a keyspace SCAN.
      {
        tags: [SCOPED_CACHE_TAGS.BRAND_CONTEXT(organizationId)],
        ttl: CACHE_TTL_BRAND,
      },
    );

    if (!brand) {
      return null;
    }

    const brandId = String(brand.id);
    // Logo/banner/references are Asset rows, not Brand columns — reading
    // `brand.logo` type-checks and is always undefined at runtime.
    const brandKitAssets = await this.cacheService.getOrSet(
      this.cacheService.generateKey('brand-assets', organizationId, brandId),
      async () =>
        this.brandsService.resolveBrandKitAssets(brandId, organizationId),
      { ttl: CACHE_TTL_BRAND },
    );
    const organizationSettings = await this.cacheService.getOrSet(
      this.cacheService.generateKey('org-settings', organizationId),
      async () =>
        this.organizationSettingsService.findOne({
          organizationId: organizationId,
        }),
      { ttl: CACHE_TTL_BRAND },
    );
    const effectiveBrandAgentConfig = resolveEffectiveBrandAgentConfig({
      brand,
      organizationSettings,
      platform: params.platform,
    });
    const context = this.createBrandContext(
      brand,
      brandKitAssets,
      effectiveBrandAgentConfig,
      layers.brandGuidance,
    );
    const fetchPromises: Array<Promise<void>> = [];

    // Layer 4: Memory Insights (cached)
    if (layers.brandMemory) {
      fetchPromises.push(
        this.loadMemoryLayer(organizationId, brandId, context),
      );
    }

    // Layer 5: RAG Context (not cached — query-dependent)
    if (layers.ragContext && params.query) {
      fetchPromises.push(
        this.loadRagLayer(organizationId, params.query, context),
      );
    }

    // Layer 6: Recent Posts
    if (layers.recentPosts) {
      fetchPromises.push(
        this.loadRecentPostsLayer(
          organizationId,
          brandId,
          params.platform,
          params.query,
          context,
        ),
      );
    }

    // Layer 7: Performance Patterns
    if (layers.performancePatterns) {
      fetchPromises.push(
        this.loadPerformancePatternsLayer(
          organizationId,
          brandId,
          params.platform,
          context,
        ),
      );
    }

    // Layer 8: Credential context (platform, handle, audience)
    if (params.credentialId) {
      fetchPromises.push(
        this.loadCredentialLayer(organizationId, params.credentialId, context),
      );
    }

    // Execute all layer fetches in parallel
    const results = await Promise.allSettled(fetchPromises);
    for (const result of results) {
      if (result.status === 'rejected') {
        this.loggerService.warn(`${this.constructorName} layer fetch failed`, {
          error: result.reason,
        });
      }
    }

    return context;
  }

  private createBrandContext(
    brand: BrandRecord,
    brandKitAssets: IBrandKitResolvedAssets,
    effectiveBrandAgentConfig: EffectiveBrandAgentConfig,
    includeBrandGuidance: boolean,
  ): AssembledBrandContext {
    const layersUsed = ['brandIdentity'];
    if (effectiveBrandAgentConfig.platformOverrideApplied) {
      layersUsed.push('platformOverride');
    }

    const context: AssembledBrandContext = {
      assembledAt: new Date(),
      brandKitReadiness: computeBrandKitReadiness(
        this.toBrandKitSourceBrand(brand, brandKitAssets),
      ),
      brandDescription: brand.description ?? undefined,
      brandId: String(brand.id),
      brandName: brand.label || 'Unknown Brand',
      defaultModel: effectiveBrandAgentConfig.defaultModel ?? undefined,
      layersUsed,
      persona: effectiveBrandAgentConfig.persona,
      promptGuidelines: this.readTextField(brand.text),
    };

    this.applyVisualIdentity(context, brand, brandKitAssets);
    if (includeBrandGuidance) {
      this.applyBrandGuidance(context, effectiveBrandAgentConfig);
    }
    return context;
  }

  private applyVisualIdentity(
    context: AssembledBrandContext,
    brand: BrandRecord,
    brandKitAssets: IBrandKitResolvedAssets,
  ): void {
    const primaryColor = this.readNonDefaultColor(
      brand.primaryColor,
      DEFAULT_PRIMARY_COLOR,
    );
    const secondaryColor = this.readNonDefaultColor(
      brand.secondaryColor,
      DEFAULT_SECONDARY_COLOR,
    );
    const backgroundColor = this.readNonDefaultColor(
      brand.backgroundColor,
      DEFAULT_BACKGROUND_COLOR,
    );
    const referenceImages = this.mergeReferenceImages(
      brand.referenceImages,
      brandKitAssets,
    );
    const logoUrl = brandKitAssets.logo?.url;
    const bannerUrl = brandKitAssets.banner?.url;
    const fontFamily = this.readTextField(brand.fontFamily);
    const hasVisualIdentity = Boolean(
      primaryColor ||
        secondaryColor ||
        backgroundColor ||
        fontFamily ||
        logoUrl ||
        bannerUrl ||
        referenceImages.length,
    );

    if (!hasVisualIdentity) {
      return;
    }

    context.visualIdentity = {};
    if (primaryColor) context.visualIdentity.primaryColor = primaryColor;
    if (secondaryColor) context.visualIdentity.secondaryColor = secondaryColor;
    if (backgroundColor)
      context.visualIdentity.backgroundColor = backgroundColor;
    if (fontFamily) context.visualIdentity.fontFamily = fontFamily;
    if (logoUrl) context.visualIdentity.logoUrl = logoUrl;
    if (bannerUrl) context.visualIdentity.bannerUrl = bannerUrl;
    if (referenceImages.length > 0) {
      context.visualIdentity.referenceImages = referenceImages;
    }
  }

  private applyBrandGuidance(
    context: AssembledBrandContext,
    effectiveBrandAgentConfig: EffectiveBrandAgentConfig,
  ): void {
    const resolvedVoice = effectiveBrandAgentConfig.voice ?? {};
    const resolvedStrategy = effectiveBrandAgentConfig.strategy ?? {};

    if (Object.keys(resolvedVoice).length > 0) {
      context.voice = {
        approvedHooks: resolvedVoice.approvedHooks,
        audience: resolvedVoice.audience?.join(', '),
        bannedPhrases: resolvedVoice.bannedPhrases,
        canonicalSource: resolvedVoice.canonicalSource,
        doNotSoundLike: resolvedVoice.doNotSoundLike,
        exemplarTexts: resolvedVoice.exemplarTexts,
        hashtags: resolvedVoice.hashtags,
        messagingPillars: resolvedVoice.messagingPillars,
        sampleOutput: resolvedVoice.sampleOutput,
        style: resolvedVoice.style,
        taglines: resolvedVoice.taglines,
        tone: resolvedVoice.tone,
        values: resolvedVoice.values,
        writingRules: resolvedVoice.writingRules,
      };
    }

    if (Object.keys(resolvedStrategy).length > 0) {
      context.strategy = {
        contentTypes: resolvedStrategy.contentTypes,
        frequency: resolvedStrategy.frequency,
        goals: resolvedStrategy.goals,
        platforms: resolvedStrategy.platforms,
      };
    }

    if (
      Object.keys(resolvedVoice).length > 0 ||
      Object.keys(resolvedStrategy).length > 0 ||
      effectiveBrandAgentConfig.persona ||
      effectiveBrandAgentConfig.defaultModel
    ) {
      context.layersUsed.push('brandGuidance');
    }
  }

  buildSystemPrompt(
    basePrompt: string,
    context: AssembledBrandContext,
    options: SystemPromptOptions = {},
  ): string {
    const maxLength =
      options.maxBrandContextLength ?? BRAND_CONTEXT_CHARACTER_BUDGET;
    const sections: string[] = [];

    // Reply style
    if (options.replyStyle) {
      const styleMap: Record<string, string> = {
        concise:
          'Be brief and to the point. Short sentences, no fluff. No emoji.',
        detailed:
          'Provide thorough explanations with context and examples. No emoji.',
        friendly:
          'Be warm, clear, and conversational while staying professional. Use simple language. No emoji.',
        professional: 'Maintain a formal, business-appropriate tone. No emoji.',
      };
      const instruction = styleMap[options.replyStyle] ?? styleMap.concise;
      sections.push(`\n\n## Reply Style\n${instruction}`);
    }

    // Brand identity
    let identity = `\n\n## Brand: ${context.brandName}`;
    if (context.brandDescription) {
      identity += `\n${context.brandDescription}`;
    }
    sections.push(identity);

    if (context.promptGuidelines) {
      sections.push(`\n## Brand Guidelines\n${context.promptGuidelines}`);
    }

    const visualIdentitySection = this.buildVisualIdentityPrompt(context);
    if (visualIdentitySection) sections.push(visualIdentitySection);
    sections.push(...this.buildVoicePromptSections(context));
    const strategySection = this.buildStrategyPrompt(context);
    if (strategySection) sections.push(strategySection);

    // Custom instructions (persona)
    if (context.persona) {
      sections.push(`\n## Custom Instructions\n${context.persona}`);
    }

    // Memory insights
    if (
      options.includeMemoryInsights !== false &&
      context.memoryInsights?.length
    ) {
      const insightLines = context.memoryInsights
        .slice(0, 5)
        .map((i) => `- [${i.category}] ${i.insight}`);
      sections.push(`\n## Performance Insights\n${insightLines.join('\n')}`);
    }

    // Proven creative patterns
    if (context.topPatterns?.length) {
      const patternLines = context.topPatterns.map(
        (p) =>
          `- [${p.patternType}] "${p.formula}" — avg score: ${p.avgPerformanceScore}`,
      );
      sections.push(
        `\n## Proven Creative Patterns\n${patternLines.join('\n')}`,
      );
    }

    // RAG context
    if (options.includeRagContext !== false && context.ragEntries?.length) {
      sections.push(
        `\n## Relevant Knowledge${context.ragEntries
          .map((entry) => `\n- [${entry.source}]: ${entry.content}`)
          .join('')}`,
      );
    }

    // Credential context (posting as a specific social account)
    if (context.credentialPlatform) {
      const handlePart = context.credentialHandle
        ? ` as ${context.credentialHandle}`
        : '';
      sections.push(
        `\n## Target Account\nYou are posting${handlePart} on ${context.credentialPlatform}. Optimize content for this platform's format and audience expectations.`,
      );
    }

    // Recent posts
    if (
      options.includeRecentPosts !== false &&
      context.recentPostSummaries?.length
    ) {
      sections.push(
        `\n## Recent Posts (avoid repetition)${context.recentPostSummaries
          .map((summary) => `\n- ${summary}`)
          .join('')}`,
      );
    }

    const brandContextPrompt = fitBrandContextToBudget(sections, maxLength);
    return [basePrompt, brandContextPrompt].filter(Boolean).join('\n\n');
  }

  private buildVisualIdentityPrompt(
    context: AssembledBrandContext,
  ): string | null {
    if (!context.visualIdentity) {
      return null;
    }

    const visualIdentity = context.visualIdentity;
    const parts: string[] = [];
    if (visualIdentity.primaryColor) {
      parts.push(`- Primary color: ${visualIdentity.primaryColor}`);
    }
    if (visualIdentity.secondaryColor) {
      parts.push(`- Secondary color: ${visualIdentity.secondaryColor}`);
    }
    if (visualIdentity.backgroundColor) {
      parts.push(`- Background color: ${visualIdentity.backgroundColor}`);
    }
    if (visualIdentity.fontFamily) {
      parts.push(`- Font: ${visualIdentity.fontFamily}`);
    }
    if (visualIdentity.logoUrl) {
      parts.push(`- Logo reference: ${visualIdentity.logoUrl}`);
    }
    if (visualIdentity.bannerUrl) {
      parts.push(`- Banner reference: ${visualIdentity.bannerUrl}`);
    }

    const referencesByCategory = new Map<string, string[]>();
    for (const image of visualIdentity.referenceImages ?? []) {
      const labels = referencesByCategory.get(image.category) ?? [];
      labels.push(image.label ? `${image.label} (${image.url})` : image.url);
      referencesByCategory.set(image.category, labels);
    }
    for (const [category, labels] of referencesByCategory) {
      parts.push(`- ${category} references: ${labels.join(', ')}`);
    }

    return parts.length > 0
      ? `\n## Visual Identity\n${parts.join('\n')}`
      : null;
  }

  private buildVoicePromptSections(context: AssembledBrandContext): string[] {
    const voice = context.voice;
    if (!voice) {
      return [];
    }

    const parts: string[] = [];
    if (voice.canonicalSource) {
      parts.push(`- Canonical voice source: ${voice.canonicalSource}`);
    }
    if (voice.tone) parts.push(`- Tone: ${voice.tone}`);
    if (voice.style) parts.push(`- Style: ${voice.style}`);
    if (voice.audience) parts.push(`- Target audience: ${voice.audience}`);
    if (voice.messagingPillars?.length) {
      parts.push(`- Messaging pillars: ${voice.messagingPillars.join(', ')}`);
    }
    if (voice.doNotSoundLike?.length) {
      parts.push(`- Avoid sounding like: ${voice.doNotSoundLike.join(', ')}`);
    }
    if (voice.values?.length) {
      parts.push(`- Brand values: ${voice.values.join(', ')}`);
    }
    if (voice.taglines?.length) {
      parts.push(`- Taglines: ${voice.taglines.join(', ')}`);
    }
    if (voice.hashtags?.length) {
      parts.push(`- Hashtags: ${voice.hashtags.join(' ')}`);
    }
    if (voice.approvedHooks?.length) {
      parts.push(
        `- Approved hook patterns: ${voice.approvedHooks.join(' | ')}`,
      );
    }
    if (voice.bannedPhrases?.length) {
      parts.push(`- Banned phrases: ${voice.bannedPhrases.join(', ')}`);
    }
    if (voice.writingRules?.length) {
      parts.push(`- Writing rules: ${voice.writingRules.join(' | ')}`);
    }

    const sections: string[] = [];
    if (parts.length > 0) {
      sections.push(`\n## Brand Voice\n${parts.join('\n')}`);
    }
    if (voice.sampleOutput) {
      sections.push(`\n## Voice Example\n${voice.sampleOutput}`);
    }
    if (voice.exemplarTexts?.length) {
      sections.push(
        `\n## Reference Exemplars\n${voice.exemplarTexts
          .map((example) => `- ${example}`)
          .join('\n')}`,
      );
    }
    return sections;
  }

  private buildStrategyPrompt(context: AssembledBrandContext): string | null {
    const strategy = context.strategy;
    if (!strategy) {
      return null;
    }

    const parts: string[] = [];
    if (strategy.goals?.length) {
      parts.push(`- Goals: ${strategy.goals.join(', ')}`);
    }
    if (strategy.contentTypes?.length) {
      parts.push(`- Content types: ${strategy.contentTypes.join(', ')}`);
    }
    if (strategy.platforms?.length) {
      parts.push(`- Platforms: ${strategy.platforms.join(', ')}`);
    }
    if (strategy.frequency) {
      parts.push(`- Frequency: ${strategy.frequency}`);
    }
    return parts.length > 0
      ? `\n## Content Strategy\n${parts.join('\n')}`
      : null;
  }

  private readTextField(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private readUrlField(value: unknown): string | undefined {
    return this.readTextField(value);
  }

  private readNonDefaultColor(
    value: unknown,
    defaultValue: string,
  ): string | undefined {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }

    return value.trim().toLowerCase() === defaultValue.toLowerCase()
      ? undefined
      : value;
  }

  private readReferenceImages(value: unknown): Array<{
    category: string;
    label?: string;
    url: string;
  }> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((img) => {
      if (typeof img === 'string') {
        return this.readUrlField(img)
          ? [{ category: 'reference', url: img }]
          : [];
      }

      if (!img || typeof img !== 'object' || Array.isArray(img)) {
        return [];
      }

      const record = img as Record<string, unknown>;
      const url = this.readUrlField(record.url);
      if (!url) {
        return [];
      }

      return [
        {
          category: this.readTextField(record.category) ?? 'reference',
          label: this.readTextField(record.label),
          url,
        },
      ];
    });
  }

  /**
   * Reference images come from two places: the legacy `Brand.referenceImages`
   * JSON column (still written by the onboarding upload path) and `Asset` rows
   * imported through the brand kit. Both are real; neither supersedes the
   * other, so the prompt gets the union, deduplicated by URL.
   */
  private mergeReferenceImages(
    value: unknown,
    assets: IBrandKitResolvedAssets,
  ): Array<{ category: string; label?: string; url: string }> {
    const merged = this.readReferenceImages(value);
    const seenUrls = new Set(merged.map((image) => image.url));

    for (const reference of assets.references) {
      if (seenUrls.has(reference.url)) {
        continue;
      }

      seenUrls.add(reference.url);
      merged.push({
        category: 'reference',
        label: reference.label,
        url: reference.url,
      });
    }

    return merged;
  }

  private toBrandKitSourceBrand(
    brand: Record<string, unknown>,
    assets: IBrandKitResolvedAssets,
  ): BrandKitSourceBrand {
    const source: BrandKitSourceBrand = {
      agentConfig:
        brand.agentConfig &&
        typeof brand.agentConfig === 'object' &&
        !Array.isArray(brand.agentConfig)
          ? (brand.agentConfig as BrandKitSourceBrand['agentConfig'])
          : undefined,
      backgroundColor: this.readTextField(brand.backgroundColor),
      bannerUrl: assets.banner?.url,
      description: this.readTextField(brand.description),
      fontFamily: this.readTextField(brand.fontFamily),
      id: this.readTextField(brand.id) ?? 'unknown-brand',
      label: this.readTextField(brand.label),
      logoUrl: assets.logo?.url,
      organization: this.readTextField(brand.organizationId),
      primaryColor: this.readTextField(brand.primaryColor),
      referenceImages: this.mergeReferenceImages(brand.referenceImages, assets),
      secondaryColor: this.readTextField(brand.secondaryColor),
      text: this.readTextField(brand.text),
    };

    return source;
  }

  private async loadMemoryLayer(
    organizationId: string,
    brandId: string,
    context: AssembledBrandContext,
  ): Promise<void> {
    const insights = await this.cacheService.getOrSet(
      this.cacheService.generateKey('brand-mem', organizationId, brandId),
      async () =>
        this.brandMemoryService.getInsights(organizationId, brandId, 10),
      { ttl: CACHE_TTL_MEMORY },
    );

    if (insights?.length) {
      context.memoryInsights = insights.map((i) => ({
        category: i.category,
        confidence: i.confidence,
        insight: i.insight,
      }));
      context.layersUsed.push('brandMemory');
    }
  }

  private async loadRagLayer(
    organizationId: string,
    query: string,
    context: AssembledBrandContext,
  ): Promise<void> {
    const result = await this.contextsService.enhancePrompt(
      {
        contentType: 'caption',
        prompt: query,
        useBrandVoice: true,
        useContentLibrary: true,
      },
      organizationId,
    );

    if (result.context?.length) {
      context.ragEntries = result.context;
      context.layersUsed.push('ragContext');
    }
  }

  private async loadRecentPostsLayer(
    organizationId: string,
    brandId: string,
    platform: string | undefined,
    query: string | undefined,
    context: AssembledBrandContext,
  ): Promise<void> {
    const cacheKey = this.cacheService.generateKey(
      'brand-posts',
      organizationId,
      brandId,
      platform || 'all',
      query?.trim() || 'recency',
    );

    const summaries = await this.cacheService.getOrSet(
      cacheKey,
      async () =>
        this.loadRecentPostSummaries(
          organizationId,
          brandId,
          platform,
          RECENT_POSTS_LIMIT,
          query,
        ),
      { ttl: CACHE_TTL_POSTS },
    );

    if (summaries?.length) {
      context.recentPostSummaries = summaries;
      context.layersUsed.push('recentPosts');
    }
  }

  private async loadPerformancePatternsLayer(
    organizationId: string,
    brandId: string,
    _platform: string | undefined,
    context: AssembledBrandContext,
  ): Promise<void> {
    const patterns = await this.patternMatcherService.getTopPatternsForBrand(
      organizationId,
      brandId,
      { limit: 5 },
    );

    if (patterns?.length) {
      context.topPatterns = patterns.map((pattern) => {
        const record = pattern as Record<string, unknown>;
        const examples = Array.isArray(record.examples)
          ? record.examples
              .map((example) => {
                const exampleRecord =
                  example && typeof example === 'object'
                    ? (example as Record<string, unknown>)
                    : {};
                return {
                  text:
                    typeof exampleRecord.text === 'string'
                      ? exampleRecord.text
                      : '',
                };
              })
              .filter((example) => example.text.length > 0)
          : [];

        return {
          avgPerformanceScore:
            typeof record.avgPerformanceScore === 'number'
              ? record.avgPerformanceScore
              : 0,
          examples,
          formula: typeof record.formula === 'string' ? record.formula : '',
          label: typeof record.label === 'string' ? record.label : 'Pattern',
          patternType:
            typeof record.patternType === 'string'
              ? record.patternType
              : 'unknown',
        };
      });
      context.layersUsed.push('performancePatterns');
    }
  }

  private async loadCredentialLayer(
    organizationId: string,
    credentialId: string,
    context: AssembledBrandContext,
  ): Promise<void> {
    if (!this.credentialsService) return;

    try {
      const credential = await this.credentialsService.findOne({
        id: credentialId,
        organizationId: organizationId,
      });

      if (!credential) return;

      context.credentialHandle = credential.username
        ? `@${credential.username}`
        : undefined;
      context.credentialPlatform = credential.platform;
      context.credentialDisplayName =
        credential.label ?? credential.username ?? undefined;
      context.layersUsed.push('credentialContext');
    } catch {
      this.loggerService.warn(
        `${this.constructorName} credential layer load failed`,
        { credentialId },
      );
    }
  }

  private async loadRecentPostSummaries(
    organizationId: string,
    brandId: string,
    platform?: string,
    limit: number = RECENT_POSTS_LIMIT,
    query?: string,
  ): Promise<string[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RECENT_POSTS_DAYS);
    const take = query?.trim()
      ? limit * RECENT_POSTS_CANDIDATE_MULTIPLIER
      : limit;

    const posts = await this.prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, description: true, platform: true },
      take,
      where: scopedWhere(organizationId, {
        brandId,
        createdAt: { gte: cutoff },
        ...(platform ? { platform } : {}),
      }),
    });

    const ranked = rankByQueryOverlap(
      posts.filter((post) => post.description),
      query ?? '',
      (post) => post.description,
    ).slice(0, limit);

    return ranked.map((post) => {
      const desc =
        post.description.length > MAX_POST_SUMMARY_LENGTH
          ? `${post.description.substring(0, MAX_POST_SUMMARY_LENGTH)}...`
          : post.description;
      return `[${post.platform}] ${desc}`;
    });
  }
}
