import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type {
  AssembleContextParams,
  AssembledBrandContext,
  ContextLayers,
  SystemPromptOptions,
} from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PatternMatcherService } from '@api/services/pattern-matcher/pattern-matcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

const DEFAULT_LAYERS: Required<ContextLayers> = {
  brandGuidance: true,
  brandIdentity: true,
  brandMemory: true,
  performancePatterns: false,
  ragContext: false,
  recentPosts: false,
};

const CACHE_TTL_BRAND = 300; // 5 min
const CACHE_TTL_MEMORY = 600; // 10 min
const CACHE_TTL_POSTS = 120; // 2 min
const RECENT_POSTS_DAYS = 14;
const RECENT_POSTS_LIMIT = 10;
const MAX_POST_SUMMARY_LENGTH = 200;

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
          organization: organizationId,
        };
        if (params.brandId) {
          filter._id = params.brandId;
        } else {
          filter.isSelected = true;
        }
        return this.brandsService.findOne(filter);
      },
      { ttl: CACHE_TTL_BRAND },
    );

    if (!brand) {
      return null;
    }

    const brandId = String(brand._id);
    const layersUsed: string[] = ['brandIdentity'];
    const organizationSettings = await this.cacheService.getOrSet(
      this.cacheService.generateKey('org-settings', organizationId),
      async () =>
        this.organizationSettingsService.findOne({
          isDeleted: false,
          organization: organizationId,
        }),
      { ttl: CACHE_TTL_BRAND },
    );
    const effectiveBrandAgentConfig = resolveEffectiveBrandAgentConfig({
      brand,
      organizationSettings,
      platform: params.platform,
    });
    const resolvedVoice = effectiveBrandAgentConfig.voice ?? {};
    const resolvedStrategy = effectiveBrandAgentConfig.strategy ?? {};
    const resolvedPersona = effectiveBrandAgentConfig.persona;
    const resolvedDefaultModel = effectiveBrandAgentConfig.defaultModel;
    const primaryColor =
      typeof brand.primaryColor === 'string' && brand.primaryColor !== '#000000'
        ? brand.primaryColor
        : undefined;
    const secondaryColor =
      typeof brand.secondaryColor === 'string' &&
      brand.secondaryColor !== '#FFFFFF'
        ? brand.secondaryColor
        : undefined;
    const referenceImages = Array.isArray(brand.referenceImages)
      ? brand.referenceImages.filter(
          (
            img,
          ): img is {
            category: string;
            label?: string;
            url?: string;
          } =>
            img !== null &&
            typeof img === 'object' &&
            !Array.isArray(img) &&
            typeof (img as { category?: unknown }).category === 'string' &&
            typeof (img as { url?: unknown }).url === 'string',
        )
      : [];

    if (effectiveBrandAgentConfig.platformOverrideApplied) {
      layersUsed.push('platformOverride');
    }

    const context: AssembledBrandContext = {
      assembledAt: new Date(),
      brandDescription: brand.description ?? undefined,
      brandId,
      brandName: brand.label || 'Unknown Brand',
      defaultModel: resolvedDefaultModel ?? undefined,
      layersUsed,
      persona: resolvedPersona,
    };

    // Visual identity (part of brandIdentity layer)
    const hasNonDefaultColor = primaryColor !== undefined;
    const hasReferenceImages = referenceImages.length > 0;

    if (hasNonDefaultColor || hasReferenceImages) {
      context.visualIdentity = {};

      if (primaryColor) {
        context.visualIdentity.primaryColor = primaryColor;
      }
      if (secondaryColor) {
        context.visualIdentity.secondaryColor = secondaryColor;
      }
      if (brand.fontFamily) {
        context.visualIdentity.fontFamily = brand.fontFamily;
      }
      if (hasReferenceImages) {
        context.visualIdentity.referenceImages = referenceImages
          .filter((img) => img.url)
          .map((img) => ({ category: img.category, label: img.label }));
      }
    }

    // Layer 2 + 3: Canonical brand guidance from Brand.agentConfig
    const fetchPromises: Array<Promise<void>> = [];

    if (layers.brandGuidance && Object.keys(resolvedVoice).length > 0) {
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

    if (layers.brandGuidance && Object.keys(resolvedStrategy).length > 0) {
      context.strategy = {
        contentTypes: resolvedStrategy.contentTypes,
        frequency: resolvedStrategy.frequency,
        goals: resolvedStrategy.goals,
        platforms: resolvedStrategy.platforms,
      };
    }

    if (
      layers.brandGuidance &&
      (Object.keys(resolvedVoice).length > 0 ||
        Object.keys(resolvedStrategy).length > 0 ||
        Boolean(resolvedPersona) ||
        Boolean(resolvedDefaultModel))
    ) {
      layersUsed.push('brandGuidance');
    }

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

  buildSystemPrompt(
    basePrompt: string,
    context: AssembledBrandContext,
    options: SystemPromptOptions = {},
  ): string {
    const maxLength = options.maxBrandContextLength ?? 6000;
    const sections: string[] = [basePrompt];

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

    // Visual identity
    if (context.visualIdentity) {
      const visParts: string[] = [];
      if (context.visualIdentity.primaryColor) {
        visParts.push(
          `- Primary color: ${context.visualIdentity.primaryColor}`,
        );
      }
      if (context.visualIdentity.secondaryColor) {
        visParts.push(
          `- Secondary color: ${context.visualIdentity.secondaryColor}`,
        );
      }
      if (context.visualIdentity.fontFamily) {
        visParts.push(`- Font: ${context.visualIdentity.fontFamily}`);
      }
      if (context.visualIdentity.referenceImages?.length) {
        const byCategory = new Map<string, string[]>();
        for (const img of context.visualIdentity.referenceImages) {
          const labels = byCategory.get(img.category) ?? [];
          labels.push(img.label || 'untitled');
          byCategory.set(img.category, labels);
        }
        for (const [cat, labels] of byCategory) {
          visParts.push(`- ${cat} references: ${labels.join(', ')}`);
        }
      }
      if (visParts.length > 0) {
        sections.push(`\n## Visual Identity\n${visParts.join('\n')}`);
      }
    }

    // Canonical brand voice from Brand.agentConfig
    const voiceParts: string[] = [];
    if (context.voice?.canonicalSource) {
      voiceParts.push(
        `- Canonical voice source: ${context.voice.canonicalSource}`,
      );
    }
    if (context.voice?.tone) {
      voiceParts.push(`- Tone: ${context.voice.tone}`);
    }
    if (context.voice?.style) {
      voiceParts.push(`- Style: ${context.voice.style}`);
    }
    if (context.voice?.audience) {
      voiceParts.push(`- Target audience: ${context.voice.audience}`);
    }
    if (context.voice?.messagingPillars?.length) {
      voiceParts.push(
        `- Messaging pillars: ${context.voice.messagingPillars.join(', ')}`,
      );
    }
    if (context.voice?.doNotSoundLike?.length) {
      voiceParts.push(
        `- Avoid sounding like: ${context.voice.doNotSoundLike.join(', ')}`,
      );
    }
    if (context.voice?.values?.length) {
      voiceParts.push(`- Brand values: ${context.voice.values.join(', ')}`);
    }
    if (context.voice?.taglines?.length) {
      voiceParts.push(`- Taglines: ${context.voice.taglines.join(', ')}`);
    }
    if (context.voice?.hashtags?.length) {
      voiceParts.push(`- Hashtags: ${context.voice.hashtags.join(' ')}`);
    }
    if (context.voice?.approvedHooks?.length) {
      voiceParts.push(
        `- Approved hook patterns: ${context.voice.approvedHooks.join(' | ')}`,
      );
    }
    if (context.voice?.bannedPhrases?.length) {
      voiceParts.push(
        `- Banned phrases: ${context.voice.bannedPhrases.join(', ')}`,
      );
    }
    if (context.voice?.writingRules?.length) {
      voiceParts.push(
        `- Writing rules: ${context.voice.writingRules.join(' | ')}`,
      );
    }
    if (voiceParts.length > 0) {
      sections.push(`\n## Brand Voice\n${voiceParts.join('\n')}`);
    }
    if (context.voice?.sampleOutput) {
      sections.push(`\n## Voice Example\n${context.voice.sampleOutput}`);
    }
    if (context.voice?.exemplarTexts?.length) {
      sections.push(
        `\n## Reference Exemplars\n${context.voice.exemplarTexts
          .map((example) => `- ${example}`)
          .join('\n')}`,
      );
    }

    // Strategy
    if (context.strategy) {
      const stratParts: string[] = [];
      if (context.strategy.goals?.length) {
        stratParts.push(`- Goals: ${context.strategy.goals.join(', ')}`);
      }
      if (context.strategy.contentTypes?.length) {
        stratParts.push(
          `- Content types: ${context.strategy.contentTypes.join(', ')}`,
        );
      }
      if (context.strategy.platforms?.length) {
        stratParts.push(
          `- Platforms: ${context.strategy.platforms.join(', ')}`,
        );
      }
      if (context.strategy.frequency) {
        stratParts.push(`- Frequency: ${context.strategy.frequency}`);
      }
      if (stratParts.length > 0) {
        sections.push(`\n## Content Strategy\n${stratParts.join('\n')}`);
      }
    }

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
      let ragSection = '\n## Relevant Knowledge';
      let charBudget =
        maxLength -
        sections.reduce((sum, s) => sum + s.length, 0) -
        ragSection.length;

      for (const entry of context.ragEntries) {
        if (charBudget <= 0) break;
        const line = `\n- [${entry.source}]: ${entry.content}`;
        if (line.length > charBudget) break;
        ragSection += line;
        charBudget -= line.length;
      }
      sections.push(ragSection);
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
      let postsSection = '\n## Recent Posts (avoid repetition)';
      let charBudget =
        maxLength -
        sections.reduce((sum, s) => sum + s.length, 0) -
        postsSection.length;

      for (const summary of context.recentPostSummaries) {
        if (charBudget <= 0) break;
        const line = `\n- ${summary}`;
        if (line.length > charBudget) break;
        postsSection += line;
        charBudget -= line.length;
      }
      sections.push(postsSection);
    }

    return sections.join('');
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
    context: AssembledBrandContext,
  ): Promise<void> {
    const cacheKey = this.cacheService.generateKey(
      'brand-posts',
      organizationId,
      brandId,
      platform || 'all',
    );

    const summaries = await this.cacheService.getOrSet(
      cacheKey,
      async () =>
        this.loadRecentPostSummaries(organizationId, brandId, platform),
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
        _id: credentialId,
        isDeleted: false,
        organization: organizationId,
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
  ): Promise<string[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RECENT_POSTS_DAYS);

    const posts = await this.prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, description: true, platform: true },
      take: limit,
      where: {
        brandId,
        createdAt: { gte: cutoff },
        isDeleted: false,
        organizationId,
        ...(platform ? { platform: platform as never } : {}),
      },
    });

    return posts
      .filter((p) => p.description)
      .map((p) => {
        const desc =
          p.description.length > MAX_POST_SUMMARY_LENGTH
            ? `${p.description.substring(0, MAX_POST_SUMMARY_LENGTH)}...`
            : p.description;
        return `[${p.platform}] ${desc}`;
      });
  }
}
