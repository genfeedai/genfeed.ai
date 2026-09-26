import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { KnowledgeContentRetrievalService } from '@api/collections/contexts/services/knowledge-content-retrieval.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { SCOPED_CACHE_TAGS } from '@api/common/constants/cache-patterns.constants';
import { scopedWhere } from '@api/index';
import type {
  AssembleContextParams,
  AssembledBrandContext,
  AssembledContextLayerName,
  ContextLayers,
  RenderedBrandSystemPrompt,
  SystemPromptOptions,
} from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
import { CacheService } from '@api/services/cache/cache.service';
import { PatternMatcherService } from '@api/services/pattern-matcher/pattern-matcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import type { IBrandKitResolvedAssets } from '@genfeedai/contracts/interfaces';
import { computeBrandKitReadiness } from '@genfeedai/helpers';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import {
  BRAND_CONTEXT_CHARACTER_BUDGET,
  BRAND_KNOWLEDGE_HEADER,
  fitBrandContextToBudgetWithReport,
  RETRIEVED_BRAND_MEMORY_HEADER,
} from './brand-context-budget.util';
import {
  mergeReferenceImages,
  readNonDefaultColor,
  readTextField,
  toBrandKitSourceBrand,
} from './brand-context-fields.util';
import { rankByQueryOverlap } from './text-overlap.util';

const DEFAULT_LAYERS: Required<ContextLayers> = {
  brandGuidance: true,
  brandIdentity: true,
  brandKnowledge: true,
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
const MAX_MEMORY_INSIGHTS = 5;
const BRAND_KNOWLEDGE_LIMIT = 4;
const MAX_BRAND_KNOWLEDGE_PASSAGE_LENGTH = 500;
const MAX_RAG_PASSAGE_LENGTH = 500;
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
    private readonly knowledgeContentRetrievalService: KnowledgeContentRetrievalService,
    private readonly membersService: MembersService,
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly loggerService: LoggerService,
    private readonly patternMatcherService: PatternMatcherService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    @Optional()
    private readonly credentialsService: CredentialsService,
  ) {}

  /**
   * Thin orchestrator: resolve brand identity (layer 1), fire the remaining
   * layers in parallel, and log any that failed. Split from a single
   * 150+ line method (#5144 follow-up) into {@link resolveBrandIdentity} and
   * {@link buildLayerFetchPromises} — behavior is unchanged.
   */
  async assembleContext(
    params: AssembleContextParams,
  ): Promise<AssembledBrandContext | null> {
    const layers = { ...DEFAULT_LAYERS, ...params.layers };
    const resolved = await this.resolveBrandIdentity(params, layers);
    if (!resolved) {
      return null;
    }
    const { brandId, context } = resolved;

    const fetchPromises = this.buildLayerFetchPromises(
      params,
      layers,
      brandId,
      context,
    );

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

  /** Layer 1: Brand Identity (required — no brand = no context). */
  private async resolveBrandIdentity(
    params: AssembleContextParams,
    layers: Required<ContextLayers>,
  ): Promise<{ brandId: string; context: AssembledBrandContext } | null> {
    const { organizationId } = params;

    // #5219: Brand.isSelected (org-wide) is retired. When the caller has no
    // explicit brand scope, fall back to the acting member's own
    // currentBrandId -- a per-member invariant -- instead of an org-wide
    // "selected" brand. No userId and no member match means no identity
    // (return null below), never an implicit "any brand in this org" guess.
    const effectiveBrandId =
      params.brandId || (await this.resolveMemberCurrentBrandId(params));

    if (!effectiveBrandId) {
      return null;
    }

    const brand = await this.cacheService.getOrSet(
      // Keyed by the resolved brand id (not a shared 'selected' token):
      // currentBrandId is per-member, so two members of the same org can
      // resolve to different brands and must never share a cache entry.
      this.cacheService.generateKey(
        'brand-ctx',
        organizationId,
        effectiveBrandId,
      ),
      async () =>
        this.brandsService.findOne({
          id: effectiveBrandId,
          isDeleted: false,
          organizationId,
        }),
      // The scoped tag lets brand-kit writes bust every brand-ctx variant for
      // the org without a keyspace SCAN.
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

    return { brandId, context };
  }

  /**
   * #5219: resolves the acting member's own `currentBrandId` as the
   * cosmetic-identity fallback when a caller has no explicit brand scope.
   * Returns null (never an org-wide guess) when there is no userId or no
   * resolvable member.
   */
  private async resolveMemberCurrentBrandId(
    params: AssembleContextParams,
  ): Promise<string | null> {
    if (!params.userId) {
      return null;
    }
    const member = await this.membersService.findOne({
      organizationId: params.organizationId,
      userId: params.userId,
    });
    return typeof member?.currentBrandId === 'string'
      ? member.currentBrandId
      : null;
  }

  /**
   * Layers 4-8. Every layer here but RAG reads brand-owned content (saved
   * memory, Knowledge, posts, performance history). `brandId` is the
   * *resolved* brand — when the caller passed no brandId,
   * `resolveBrandIdentity` still resolves it to the acting member's own
   * `currentBrandId` purely to render cosmetic identity (name, voice,
   * persona). Gating these layers on `params.brandId` instead of `brandId`
   * means a thread with no explicit brand scope never pulls another brand's
   * saved memory, BRAND_TRUTH facts, recent posts or performance patterns
   * just because the org happens to have one brand marked selected.
   */
  private buildLayerFetchPromises(
    params: AssembleContextParams,
    layers: Required<ContextLayers>,
    brandId: string,
    context: AssembledBrandContext,
  ): Array<Promise<void>> {
    const { organizationId } = params;
    const hasExplicitBrandId = Boolean(params.brandId);
    const fetchPromises: Array<Promise<void>> = [];

    // Layer 4: Memory Insights (cached)
    if (layers.brandMemory && hasExplicitBrandId) {
      fetchPromises.push(
        this.loadMemoryLayer(organizationId, brandId, context),
      );
    }

    // Layer 5: RAG Context (not cached — query-dependent). Scoped to the
    // thread's own validated brand (params.brandId), not the brand resolved
    // above for identity/voice — a thread with no brand must never inherit
    // another brand's saved memory just because the org has one selected.
    if (layers.ragContext && params.query) {
      fetchPromises.push(
        this.loadRagLayer(
          organizationId,
          params.userId,
          params.brandId,
          params.query,
          context,
        ),
      );
    }

    // Layer 5b: authoritative BRAND_TRUTH Knowledge (query-dependent)
    if (layers.brandKnowledge && hasExplicitBrandId && params.query) {
      fetchPromises.push(
        this.loadBrandKnowledgeLayer(
          organizationId,
          brandId,
          params.query,
          context,
        ),
      );
    }

    // Layer 6: Recent Posts
    if (layers.recentPosts && hasExplicitBrandId) {
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
    if (layers.performancePatterns && hasExplicitBrandId) {
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

    return fetchPromises;
  }

  private createBrandContext(
    brand: BrandRecord,
    brandKitAssets: IBrandKitResolvedAssets,
    effectiveBrandAgentConfig: EffectiveBrandAgentConfig,
    includeBrandGuidance: boolean,
  ): AssembledBrandContext {
    const layersUsed: AssembledContextLayerName[] = ['brandIdentity'];
    if (effectiveBrandAgentConfig.platformOverrideApplied) {
      layersUsed.push('platformOverride');
    }

    const context: AssembledBrandContext = {
      assembledAt: new Date(),
      brandKitReadiness: computeBrandKitReadiness(
        toBrandKitSourceBrand(brand, brandKitAssets),
      ),
      brandDescription: brand.description ?? undefined,
      brandId: String(brand.id),
      brandName: brand.label || 'Unknown Brand',
      defaultModel: effectiveBrandAgentConfig.defaultModel ?? undefined,
      layersUsed,
      persona: effectiveBrandAgentConfig.persona,
      promptGuidelines: readTextField(brand.text),
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
    const primaryColor = readNonDefaultColor(
      brand.primaryColor,
      DEFAULT_PRIMARY_COLOR,
    );
    const secondaryColor = readNonDefaultColor(
      brand.secondaryColor,
      DEFAULT_SECONDARY_COLOR,
    );
    const backgroundColor = readNonDefaultColor(
      brand.backgroundColor,
      DEFAULT_BACKGROUND_COLOR,
    );
    const referenceImages = mergeReferenceImages(
      brand.referenceImages,
      brandKitAssets,
    );
    const logoUrl = brandKitAssets.logo?.url;
    const bannerUrl = brandKitAssets.banner?.url;
    const fontFamily = readTextField(brand.fontFamily);
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
        topics: resolvedStrategy.topics,
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
    return this.renderSystemPrompt(basePrompt, context, options).prompt;
  }

  /**
   * Renders the brand system prompt and reports how the brand context was
   * fitted to its budget: every section with its priority, original and
   * rendered length, and whether it was kept, trimmed or dropped.
   */
  renderSystemPrompt(
    basePrompt: string,
    context: AssembledBrandContext,
    options: SystemPromptOptions = {},
  ): RenderedBrandSystemPrompt {
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
        .slice(0, MAX_MEMORY_INSIGHTS)
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

    // Authoritative brand Knowledge (BRAND_TRUTH sources only)
    if (
      options.includeBrandKnowledge !== false &&
      context.brandKnowledgeEntries?.length
    ) {
      sections.push(
        `\n${BRAND_KNOWLEDGE_HEADER}\nVerified brand facts from the brand's Knowledge. Treat them as authoritative and prefer them over assumptions.${context.brandKnowledgeEntries
          .map(
            (entry) =>
              `\n- [${this.toPromptLine(entry.citation.title)}]: ${entry.content}`,
          )
          .join('')}`,
      );
    }

    // Saved brand memory (retrieved passages; not authoritative)
    if (options.includeRagContext !== false && context.ragEntries?.length) {
      sections.push(
        `\n${RETRIEVED_BRAND_MEMORY_HEADER}${context.ragEntries
          .map(
            (entry) =>
              `\n- [${this.toPromptLine(entry.citation.title)}]: ${this.toPromptLine(entry.content, MAX_RAG_PASSAGE_LENGTH)}`,
          )
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

    const brandContext = fitBrandContextToBudgetWithReport(sections, maxLength);
    return {
      basePrompt,
      brandContext,
      prompt: [basePrompt, brandContext.text].filter(Boolean).join('\n\n'),
    };
  }

  /**
   * Collapse a retrieved passage to one line so it cannot open a new prompt
   * section (a `## ...` or `HEADER:` line) and shift budget priorities.
   */
  private toPromptLine(value: string, maxLength?: number): string {
    const line = value.replace(/\s+/g, ' ').trim();
    if (maxLength === undefined || line.length <= maxLength) {
      return line;
    }
    return `${line.slice(0, maxLength - 1).trimEnd()}…`;
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
      parts.push(
        `- Writing rules:\n${voice.writingRules
          .map((rule) => `  - ${rule}`)
          .join('\n')}`,
      );
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
        `\n## Real Posts by This Brand (style reference)\nMatch their length, casing, punctuation and reply style. Never copy them verbatim.\n${voice.exemplarTexts
          .map((example) =>
            example
              .split('\n')
              .map((line) => `> ${line}`)
              .join('\n'),
          )
          .join('\n\n')}`,
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
    if (strategy.topics?.length) {
      parts.push(`- Topics: ${strategy.topics.join(', ')}`);
    }
    if (strategy.frequency) {
      parts.push(`- Frequency: ${strategy.frequency}`);
    }
    return parts.length > 0
      ? `\n## Content Strategy\n${parts.join('\n')}`
      : null;
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
      context.memoryInsights = insights
        .slice(0, MAX_MEMORY_INSIGHTS)
        .map((i) => ({
          category: i.category,
          confidence: i.confidence,
          insight: i.insight,
        }));
      context.layersUsed.push('brandMemory');
    }
  }

  /**
   * Automatic chat-retrieval grounding through the Knowledge retrieval
   * contract. A thread scoped to a brand only ever sees that brand's own
   * Knowledge plus organization-wide sources (never another brand's); an
   * unscoped thread only sees organization-wide plus the actor's own
   * personal-scope Knowledge. Every returned entry carries a citation —
   * uncited hits (legacy, unlinked chunks) are dropped rather than shown
   * without source identity.
   */
  private async loadRagLayer(
    organizationId: string,
    userId: string | undefined,
    threadBrandId: string | undefined,
    query: string,
    context: AssembledBrandContext,
  ): Promise<void> {
    const hits = threadBrandId
      ? await this.knowledgeContentRetrievalService.retrieveBrandContentMemory({
          brandId: threadBrandId,
          isKnowledgeOnly: true,
          organizationId,
          query,
        })
      : userId
        ? await this.knowledgeContentRetrievalService.retrieveOrgAndPersonalContentMemory(
            {
              organizationId,
              query,
              userId,
            },
          )
        : [];

    const entries = hits.flatMap((hit) =>
      hit.citation
        ? [
            {
              citation: hit.citation,
              content: hit.content,
              relevance: hit.relevance,
            },
          ]
        : [],
    );

    if (entries.length > 0) {
      context.ragEntries = entries;
      context.layersUsed.push('ragContext');
    }
  }

  private async loadBrandKnowledgeLayer(
    organizationId: string,
    brandId: string,
    query: string,
    context: AssembledBrandContext,
  ): Promise<void> {
    const hits =
      await this.knowledgeContentRetrievalService.retrieveBrandKnowledge({
        brandId,
        limit: BRAND_KNOWLEDGE_LIMIT,
        organizationId,
        query,
      });

    // Inspiration and research must never silently become authoritative
    // brand context, whatever the retrieval layer returns.
    const entries = hits.flatMap((hit) =>
      hit.citation?.purpose === KnowledgeSourcePurpose.BRAND_TRUTH
        ? [
            {
              citation: hit.citation,
              content: this.toPromptLine(
                hit.content,
                MAX_BRAND_KNOWLEDGE_PASSAGE_LENGTH,
              ),
              relevance: hit.relevance,
            },
          ]
        : [],
    );

    if (entries.length > 0) {
      context.brandKnowledgeEntries = entries;
      context.layersUsed.push('brandKnowledge');
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
