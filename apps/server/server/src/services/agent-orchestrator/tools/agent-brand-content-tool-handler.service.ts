import { randomUUID } from 'node:crypto';
import { APP_ROUTES } from '@genfeedai/constants';
import type {
  AgentToolResult,
  IBrandAgentPrompting,
  IBrandConversationStarter,
  IGeneratedBrandProfile,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ToolExecutionContext } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
import { BatchGenerationService } from '@server/services/batch-generation/batch-generation.service';

interface AgentBrandsServiceLike {
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
  generateBrandVoice?: (
    dto: {
      brandId?: string;
      examplesToAvoid?: string[];
      examplesToEmulate?: string[];
      industry?: string;
      offering?: string;
      targetAudience?: string;
      url?: string;
    },
    organizationId: string,
  ) => Promise<IGeneratedBrandProfile>;
  updateAgentConfig?: (
    brandId: string,
    orgId: string,
    agentConfig: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
}

interface BatchGenerationRunnerLike {
  generateBatch: (
    params: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

interface BrandVoiceProfileDraft {
  approvedHooks: string[];
  audience: string[];
  bannedPhrases: string[];
  canonicalSource?: 'brand' | 'founder' | 'hybrid';
  doNotSoundLike: string[];
  exemplarTexts: string[];
  hashtags: string[];
  messagingPillars: string[];
  prompting?: IBrandAgentPrompting;
  sampleOutput: string;
  strategy?: {
    goals: string[];
    topics: string[];
  };
  style: string;
  taglines: string[];
  tone: string;
  values: string[];
  writingRules: string[];
}

/**
 * Monthly content calendar + brand voice draft/save tools.
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentBrandContentToolHandler {
  constructor(
    private readonly loggerService: LoggerService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    @Optional()
    private readonly batchGenerationService?: BatchGenerationService,
  ) {}
  async generateMonthlyContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandId = params.brandId as string;
    const platforms = (params.platforms as string[]) || ['twitter'];

    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    try {
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 30);

      const batchResult = await (
        this.batchGenerationService as unknown as BatchGenerationRunnerLike
      ).generateBatch({
        brandId,
        contentMix: {
          carouselPercent: 0,
          imagePercent: 30,
          reelPercent: 0,
          storyPercent: 0,
          videoPercent: 10,
        },
        count: 30,
        dateRange: {
          end: endDate.toISOString().split('T')[0],
          start: now.toISOString().split('T')[0],
        },
        organizationId: ctx.organizationId,
        platforms,
        userId: ctx.userId,
      });

      return {
        creditsUsed: 5,
        data: {
          batchId: batchResult.batchId,
          itemCount: batchResult.itemCount,
          message: `Created a 30-day content calendar with ${batchResult.itemCount} items. Review them in the Calendar or Review page.`,
        },
        nextActions: [
          {
            ctas: [
              {
                href: APP_ROUTES.PUBLISHING.CALENDAR,
                label: 'View Calendar',
              },
              {
                href: APP_ROUTES.PUBLISHING.REVIEW,
                label: 'Review Queue',
              },
            ],
            description: `${batchResult.itemCount} content items scheduled over the next 30 days`,
            id: `calendar-gen-${batchResult.batchId}`,
            title: '30-day content calendar created',
            type: 'content_preview_card',
          },
        ],
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error('generateMonthlyContent failed', error);
      return {
        creditsUsed: 0,
        error: 'Failed to generate monthly content',
        success: false,
      };
    }
  }

  private normalizeStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    if (typeof value === 'string') {
      return value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  }

  private async resolveTargetBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown> | null> {
    const explicitBrandId =
      typeof params.brandId === 'string'
        ? params.brandId
        : typeof ctx.brandId === 'string'
          ? ctx.brandId
          : null;

    if (explicitBrandId) {
      return this.brandsService.findOne({
        id: explicitBrandId,
        organizationId: ctx.organizationId,
      });
    }

    return this.brandsService.findOne({
      organizationId: ctx.organizationId,
    });
  }

  private formatBrandVoiceProfile(
    profile: Partial<BrandVoiceProfileDraft>,
  ): string {
    const sections = [
      `Tone: ${profile.tone || 'Not set'}`,
      `Style: ${profile.style || 'Not set'}`,
      `Audience: ${profile.audience?.join(', ') || 'Not set'}`,
      `Messaging pillars: ${profile.messagingPillars?.join(', ') || 'Not set'}`,
      `Topics: ${profile.strategy?.topics.join(', ') || 'Not set'}`,
      `Content goals: ${profile.strategy?.goals.join(', ') || 'Not set'}`,
      `Core values: ${profile.values?.join(', ') || 'Not set'}`,
      `Avoid: ${profile.doNotSoundLike?.join(', ') || 'Not set'}`,
      `Taglines: ${profile.taglines?.join(', ') || 'Not set'}`,
      `Hashtags: ${profile.hashtags?.join(', ') || 'Not set'}`,
      `Conversation starters: ${profile.prompting?.conversationStarters.map((starter) => starter.label).join(', ') || 'Not set'}`,
      `Sample output:\n${profile.sampleOutput || 'Not set'}`,
    ];

    return sections.join('\n\n');
  }

  private normalizeBrandPrompting(
    value: unknown,
  ): IBrandAgentPrompting | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const seeds = Array.isArray(record.seeds)
      ? record.seeds
          .flatMap((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
              return [];
            }
            const seed = entry as Record<string, unknown>;
            const topic =
              typeof seed.topic === 'string' ? seed.topic.trim() : '';
            if (!topic) {
              return [];
            }
            return [
              {
                angle: typeof seed.angle === 'string' ? seed.angle.trim() : '',
                audience:
                  typeof seed.audience === 'string' ? seed.audience.trim() : '',
                preferredFormats: this.normalizeStringList(
                  seed.preferredFormats,
                ).slice(0, 3),
                topic,
              },
            ];
          })
          .slice(0, 6)
      : [];
    const conversationStarters = Array.isArray(record.conversationStarters)
      ? record.conversationStarters
          .flatMap<IBrandConversationStarter>((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
              return [];
            }
            const starter = entry as Record<string, unknown>;
            const intent = starter.intent;
            const label =
              typeof starter.label === 'string' ? starter.label.trim() : '';
            const prompt =
              typeof starter.prompt === 'string' ? starter.prompt.trim() : '';
            const topic =
              typeof starter.topic === 'string' ? starter.topic.trim() : '';
            if (
              (intent !== 'analyze' &&
                intent !== 'create' &&
                intent !== 'plan') ||
              !label ||
              !prompt ||
              !topic
            ) {
              return [];
            }
            return [
              {
                id:
                  typeof starter.id === 'string' && starter.id.trim()
                    ? starter.id.trim()
                    : `brand-${intent}-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                intent,
                label: label.slice(0, 32),
                prompt: prompt.slice(0, 220),
                topic,
              },
            ];
          })
          .slice(0, 3)
      : [];

    return seeds.length > 0 && conversationStarters.length > 0
      ? { conversationStarters, seeds }
      : undefined;
  }

  async draftBrandVoiceProfile(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.brandsService.generateBrandVoice) {
      return {
        creditsUsed: 0,
        error: 'Brand voice generation is not available in this environment.',
        success: false,
      };
    }

    const brand = await this.resolveTargetBrand(params, ctx);
    if (!brand?.id) {
      return {
        creditsUsed: 0,
        error: 'Create or select a brand before drafting brand voice.',
        success: false,
      };
    }

    const profile = await this.brandsService.generateBrandVoice(
      {
        brandId: String(brand.id),
        examplesToAvoid: this.normalizeStringList(params.examplesToAvoid),
        examplesToEmulate: this.normalizeStringList(params.examplesToEmulate),
        industry:
          typeof params.industry === 'string'
            ? params.industry.trim()
            : undefined,
        offering:
          typeof params.offering === 'string'
            ? params.offering.trim()
            : undefined,
        targetAudience:
          typeof params.targetAudience === 'string'
            ? params.targetAudience.trim()
            : undefined,
        url: typeof params.url === 'string' ? params.url.trim() : undefined,
      },
      ctx.organizationId,
    );
    const sourceActionId = `brand-voice-profile-${randomUUID()}`;

    return {
      creditsUsed: 0,
      data: {
        brandId: String(brand.id),
        brandName:
          typeof brand.label === 'string' && brand.label.trim()
            ? brand.label.trim()
            : 'Selected brand',
        voiceProfile: profile,
      },
      nextActions: [
        {
          brandId: String(brand.id),
          ctas: [
            {
              action: 'confirm_save_brand_voice_profile',
              label: 'Approve and save',
              payload: {
                brandId: String(brand.id),
                sourceActionId,
                voiceProfile: profile,
              },
            },
          ],
          data: { voiceProfile: profile },
          description:
            'Review this draft. Ask for changes in chat, or approve to save it to the brand.',
          id: sourceActionId,
          textContent: this.formatBrandVoiceProfile(profile),
          title: 'Brand Voice Draft',
          type: 'brand_voice_profile_card',
        },
      ],
      success: true,
    };
  }

  async saveBrandVoiceProfile(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.brandsService.updateAgentConfig) {
      return {
        creditsUsed: 0,
        error: 'Brand config updates are not available in this environment.',
        success: false,
      };
    }

    const brand = await this.resolveTargetBrand(params, ctx);
    if (!brand?.id) {
      return {
        creditsUsed: 0,
        error: 'Create or select a brand before saving brand voice.',
        success: false,
      };
    }

    const rawProfile =
      params.voiceProfile && typeof params.voiceProfile === 'object'
        ? (params.voiceProfile as Record<string, unknown>)
        : null;

    if (!rawProfile) {
      return {
        creditsUsed: 0,
        error: 'save_brand_voice_profile requires a voiceProfile payload.',
        success: false,
      };
    }

    const profile: BrandVoiceProfileDraft = {
      approvedHooks: this.normalizeStringList(rawProfile.approvedHooks),
      audience: this.normalizeStringList(rawProfile.audience),
      bannedPhrases: this.normalizeStringList(rawProfile.bannedPhrases),
      canonicalSource:
        rawProfile.canonicalSource === 'brand' ||
        rawProfile.canonicalSource === 'founder' ||
        rawProfile.canonicalSource === 'hybrid'
          ? rawProfile.canonicalSource
          : undefined,
      doNotSoundLike: this.normalizeStringList(rawProfile.doNotSoundLike),
      exemplarTexts: this.normalizeStringList(rawProfile.exemplarTexts),
      hashtags: this.normalizeStringList(rawProfile.hashtags),
      messagingPillars: this.normalizeStringList(rawProfile.messagingPillars),
      prompting: this.normalizeBrandPrompting(rawProfile.prompting),
      sampleOutput:
        typeof rawProfile.sampleOutput === 'string'
          ? rawProfile.sampleOutput.trim()
          : '',
      style:
        typeof rawProfile.style === 'string' ? rawProfile.style.trim() : '',
      taglines: this.normalizeStringList(rawProfile.taglines),
      strategy:
        rawProfile.strategy &&
        typeof rawProfile.strategy === 'object' &&
        !Array.isArray(rawProfile.strategy)
          ? {
              goals: this.normalizeStringList(
                (rawProfile.strategy as Record<string, unknown>).goals,
              ),
              topics: this.normalizeStringList(
                (rawProfile.strategy as Record<string, unknown>).topics,
              ),
            }
          : undefined,
      tone: typeof rawProfile.tone === 'string' ? rawProfile.tone.trim() : '',
      values: this.normalizeStringList(rawProfile.values),
      writingRules: this.normalizeStringList(rawProfile.writingRules),
    };

    const existingAgentConfig =
      brand.agentConfig &&
      typeof brand.agentConfig === 'object' &&
      !Array.isArray(brand.agentConfig)
        ? (brand.agentConfig as Record<string, unknown>)
        : {};
    const existingStrategy =
      existingAgentConfig.strategy &&
      typeof existingAgentConfig.strategy === 'object' &&
      !Array.isArray(existingAgentConfig.strategy)
        ? (existingAgentConfig.strategy as Record<string, unknown>)
        : {};

    await this.brandsService.updateAgentConfig(
      String(brand.id),
      ctx.organizationId,
      {
        ...(profile.prompting ? { prompting: profile.prompting } : {}),
        ...(profile.strategy
          ? { strategy: { ...existingStrategy, ...profile.strategy } }
          : {}),
        voice: {
          approvedHooks: profile.approvedHooks,
          audience: profile.audience,
          bannedPhrases: profile.bannedPhrases,
          canonicalSource: profile.canonicalSource,
          doNotSoundLike: profile.doNotSoundLike,
          exemplarTexts: profile.exemplarTexts,
          hashtags: profile.hashtags,
          messagingPillars: profile.messagingPillars,
          sampleOutput: profile.sampleOutput,
          style: profile.style,
          taglines: profile.taglines,
          tone: profile.tone,
          values: profile.values,
          writingRules: profile.writingRules,
        },
      },
    );

    return {
      creditsUsed: 0,
      data: {
        brandId: String(brand.id),
        saved: true,
        voiceProfile: profile,
      },
      success: true,
    };
  }
}
