import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { type AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import {
  type AgentFeedbackMemoryDocument,
  type AgentFeedbackMemoryInfluence,
  AgentMemoriesService,
} from '@api/collections/agent-memories/services/agent-memories.service';
import { type AgentMessageDocument } from '@api/collections/agent-messages/schemas/agent-message.schema';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { resolveEffectiveAgentExecutionConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { AgentScopeContextService, type PreparedAgentScope } from '@api/index';
import { AgentMessageBusService } from '@api/services/agent-campaign/agent-message-bus.service';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AGENT_ORCHESTRATOR_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/agent-orchestrator-system-prompt.constant';
import { getAgentTypeConfig } from '@api/services/agent-orchestrator/constants/agent-type-config.constant';
import { BRAND_INTERVIEW_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/brand-interview-system-prompt.constant';
import { COMMUNITY_ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/community-onboarding-system-prompt.constant';
import { ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/onboarding-system-prompt.constant';
import type {
  AgentChatAttachment,
  AgentChatContext,
  AgentChatRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { composeAgentGuardrails } from '@api/services/agent-orchestrator/utils/agent-guardrail-compose.util';
import { buildPageContextPrompt } from '@api/services/agent-orchestrator/utils/agent-page-context.util';
import {
  applyAgentReplyStyle,
  buildAgentSystemPrompt,
} from '@api/services/agent-orchestrator/utils/agent-system-prompt.util';
import {
  fenceUntrustedContent,
  sanitizeAgentUntrustedInput,
  UNTRUSTED_USER_DATA_FRAMING,
} from '@api/services/agent-orchestrator/utils/agent-untrusted-content.util';
import { ThreadContextCompressorService } from '@api/services/agent-threading/services/thread-context-compressor.service';
import type { OpenRouterMessage } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { AgentMessageRole, AgentType } from '@genfeedai/enums';
import type { ResolvedRuntimeSkill } from '@genfeedai/interfaces/ai';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

function buildGenerationModePrompt(
  mode: AgentChatRequest['generationMode'],
): string {
  if (mode === 'image') {
    return 'The operator explicitly selected Image mode for this turn (generationType=image). Generate the image directly in this turn using the available visual-generation tool. Do not ask for another confirmation. Do not choose video.';
  }
  if (mode === 'video') {
    return 'The operator explicitly selected Video mode for this turn (generationType=video). Generate the video directly in this turn using the available visual-generation tool. Do not ask for another confirmation. Do not choose image.';
  }
  return '';
}

@Injectable()
export class AgentOrchestratorContextService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly loggerService: LoggerService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentScopeContextService: AgentScopeContextService,
    private readonly agentMemoriesService: AgentMemoriesService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly contextAssemblyService: AgentContextAssemblyService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly agentStrategiesService: AgentStrategiesService,
    @Optional()
    private readonly agentMessageBusService?: AgentMessageBusService,
    @Optional()
    private readonly agentCampaignsService?: AgentCampaignsService,
    @Optional()
    private readonly threadContextCompressorService?: ThreadContextCompressorService,
    @Optional()
    private readonly skillRuntimeService?: SkillRuntimeService,
  ) {}

  async resolveSystemPromptAndModel(
    request: AgentChatRequest,
    context: AgentChatContext,
  ): Promise<{
    model: string | undefined;
    policy: ResolvedAgentExecutionPolicy;
    preparedScope: PreparedAgentScope;
    resolvedSkills: ResolvedRuntimeSkill[];
    systemPrompt: string | undefined;
    memories: AgentMemoryDocument[];
  }> {
    const shouldUseOnboardingPrompt = request.source === 'onboarding';
    const strategy = context.strategyId
      ? await this.agentStrategiesService.findOneById(
          context.strategyId,
          context.organizationId,
        )
      : null;
    const agentTypeConfig = request.agentType
      ? getAgentTypeConfig(request.agentType)
      : null;
    const orgSettings = await this.organizationSettingsService.findOne({
      organizationId: context.organizationId,
    });
    const { policy: basePolicy, strategyModel } =
      resolveEffectiveAgentExecutionConfig({
        organizationSettings: orgSettings,
        strategy,
      });
    const preparedScope = await this.agentScopeContextService.prepareForTurn({
      expectedContextVersion: request.expectedContextVersion,
      organizationId: context.organizationId,
      policyBrandId: basePolicy.brandId,
      requestedBrandId: request.brandId,
      threadId: request.threadId,
      userId: context.userId,
    });
    const policy: ResolvedAgentExecutionPolicy = {
      ...basePolicy,
      brandId:
        preparedScope.existingScope?.brandId ?? preparedScope.initialBrandId,
    };

    let thread: {
      systemPrompt?: string;
      memoryEntryIds?: string[];
    } | null = null;

    if (isEntityId(request.threadId)) {
      thread = (await this.agentThreadsService.findOne({
        id: request.threadId,
        organizationId: context.organizationId,
      })) as { systemPrompt?: string; memoryEntryIds?: string[] } | null;
    }

    const memories =
      await this.agentMemoriesService.getFeedbackMemoriesForGeneration(
        context.userId,
        context.organizationId,
        {
          brandId: policy.brandId,
          campaignId: context.campaignId,
          contentType: this.inferMemoryContentType(request.content),
          limit: 8,
          pinnedMemoryIds: thread?.memoryEntryIds,
          platform: policy.platform,
          query: request.content,
        },
      );

    const replyStyle = orgSettings?.agentReplyStyle;
    const shouldLoadBrandContext =
      Boolean(policy.brandId) ||
      (!thread?.systemPrompt && !request.systemPromptOverride);
    // Main conversational agent: brandMemory + performancePatterns stay on
    // (#3019). Retrieval layers (#2460) turn on when the turn has a query so
    // pgvector knowledge and semantically close recent posts can ground the
    // reply. Empty knowledge stores remain a no-op inside assembleContext.
    const brandContext = shouldLoadBrandContext
      ? await this.contextAssemblyService.assembleContext({
          brandId: policy.brandId,
          layers: {
            brandGuidance: true,
            brandIdentity: true,
            brandMemory: true,
            performancePatterns: true,
            ragContext: true,
            recentPosts: true,
          },
          organizationId: context.organizationId,
          platform: policy.platform,
          query: request.content,
        })
      : null;
    // Chat always runs the pinned catalogue default — there is no user-facing
    // model picker and no per-org/per-brand override. Only an explicit
    // strategy pin, a thinking-model override, or an agent-type default may
    // steer the model; a retired key still maps forward to its catalogue
    // successor so the model we call is always one the biller has a real
    // price for.
    const resolveModel = async (): Promise<string> =>
      this.agentChatModelRegistry.resolveModelKey(
        strategyModel ||
          policy.thinkingModelOverride ||
          agentTypeConfig?.defaultModel,
      );

    const resolvedSkills =
      this.skillRuntimeService && policy.brandId
        ? await this.skillRuntimeService.resolveActiveSkills(
            context.organizationId,
            policy.brandId,
            strategy?.skillSlugs,
            {
              agentType: request.agentType,
              channel: policy.platform,
              modality: this.inferSkillModality(request),
            },
          )
        : [];
    const skillPromptSuffix = this.skillRuntimeService
      ? this.skillRuntimeService.buildSkillPromptSections(resolvedSkills)
      : '';
    const generationModePrompt = buildGenerationModePrompt(
      request.generationMode,
    );

    if (shouldUseOnboardingPrompt) {
      return {
        memories,
        model: await resolveModel(),
        policy,
        preparedScope,
        resolvedSkills,
        systemPrompt: composeAgentGuardrails(
          isSelfHostedDeployment()
            ? COMMUNITY_ONBOARDING_SYSTEM_PROMPT
            : ONBOARDING_SYSTEM_PROMPT,
        ),
      };
    }

    if (request.agentType === AgentType.BRAND_INTERVIEW) {
      return {
        memories,
        model: await resolveModel(),
        policy,
        preparedScope,
        resolvedSkills,
        systemPrompt: composeAgentGuardrails(BRAND_INTERVIEW_SYSTEM_PROMPT),
      };
    }

    const pageContextPrompt = buildPageContextPrompt(
      request.pageContext,
      request.artifactReferences,
    );

    if (thread?.systemPrompt) {
      const prompt = [
        thread.systemPrompt,
        skillPromptSuffix,
        generationModePrompt,
        pageContextPrompt,
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        memories,
        model: await resolveModel(),
        policy,
        preparedScope,
        resolvedSkills,
        systemPrompt: composeAgentGuardrails(prompt),
      };
    }

    if (request.systemPromptOverride) {
      const prompt = [
        request.systemPromptOverride,
        skillPromptSuffix,
        generationModePrompt,
        pageContextPrompt,
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        memories,
        model: await resolveModel(),
        policy,
        preparedScope,
        resolvedSkills,
        systemPrompt: composeAgentGuardrails(prompt),
      };
    }
    const typeSuffix = [
      agentTypeConfig?.systemPromptSuffix,
      generationModePrompt,
    ]
      .filter(Boolean)
      .join('\n\n');
    const basePrompt = buildAgentSystemPrompt({
      content: request.content,
      pageContextPrompt,
      skillPromptSuffix,
      typeSuffix: typeSuffix || undefined,
    });

    if (brandContext) {
      const systemPrompt = this.contextAssemblyService.buildSystemPrompt(
        basePrompt,
        brandContext,
        { replyStyle },
      );
      return {
        memories,
        model: await resolveModel(),
        policy,
        preparedScope,
        resolvedSkills,
        systemPrompt: composeAgentGuardrails(systemPrompt),
      };
    }

    if (replyStyle || typeSuffix) {
      return {
        memories,
        model: await resolveModel(),
        policy,
        preparedScope,
        resolvedSkills,
        systemPrompt: composeAgentGuardrails(
          applyAgentReplyStyle(basePrompt, replyStyle),
        ),
      };
    }

    return {
      memories,
      model: await resolveModel(),
      policy,
      preparedScope,
      resolvedSkills,
      systemPrompt: typeSuffix ? composeAgentGuardrails(basePrompt) : undefined,
    };
  }
  buildMessageHistory(
    messages: AgentMessageDocument[],
    systemPromptOverride?: string,
    memories?: AgentMemoryDocument[],
    attachments?: AgentChatAttachment[],
    compressedThreadContext?: string,
  ): OpenRouterMessage[] {
    const systemPrompt = (
      systemPromptOverride ||
      composeAgentGuardrails(AGENT_ORCHESTRATOR_SYSTEM_PROMPT)
    ).replace('{{date}}', new Date().toISOString().split('T')[0]);

    const history: OpenRouterMessage[] = [
      { content: systemPrompt, role: 'system' },
    ];

    if (memories && memories.length > 0) {
      const preview = this.buildMemoryPromptSections(memories);

      if (preview) {
        history.push({
          content: preview,
          role: 'system',
        });
      }
    }

    // Inject compressed thread context as a user message if available
    if (compressedThreadContext) {
      history.push({
        content: compressedThreadContext,
        role: 'user',
      });
    }

    // Messages are already limited by getRecentMessages() or getMessagesAfter()
    const lastUserIndex = this.findLastUserMessageIndex(messages);

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (
        msg.role === AgentMessageRole.USER ||
        msg.role === AgentMessageRole.ASSISTANT
      ) {
        const isLatestUserMessage =
          i === lastUserIndex && msg.role === AgentMessageRole.USER;

        if (isLatestUserMessage && attachments?.length) {
          history.push({
            content: [
              {
                text: fenceUntrustedContent(msg.content || ''),
                type: 'text',
              },
              ...attachments.map((a) => ({
                image_url: { url: a.url },
                type: 'image_url' as const,
              })),
            ],
            role: 'user',
          });
        } else {
          const content =
            msg.role === AgentMessageRole.USER
              ? fenceUntrustedContent(msg.content || '')
              : msg.content || '';
          history.push({
            content,
            role: msg.role as 'user' | 'assistant',
          });
        }
      }
    }

    return history;
  }
  /**
   * Resolve messages and optional compressed context for a thread.
   * If compaction is available, returns windowed messages + compressed context.
   * Otherwise falls back to the standard getRecentMessages(20).
   */
  async resolveThreadMessages(
    threadId: string,
    organizationId: string,
  ): Promise<{
    messages: AgentMessageDocument[];
    compressedContext?: string;
  }> {
    if (!this.threadContextCompressorService) {
      return {
        messages: await this.agentMessagesService.getRecentMessages(
          threadId,
          20,
          organizationId,
        ),
      };
    }

    const state = await this.threadContextCompressorService.getStateOrCompact(
      threadId,
      organizationId,
    );

    if (!state) {
      return {
        messages: await this.agentMessagesService.getRecentMessages(
          threadId,
          20,
          organizationId,
        ),
      };
    }

    const windowMessages =
      await this.threadContextCompressorService.getWindowMessages(
        threadId,
        state.data.lastIncorporatedMessageId ?? '',
      );

    const compressedContext =
      this.threadContextCompressorService.renderStateAsUserMessage(
        state,
        windowMessages,
      );

    return { compressedContext, messages: windowMessages };
  }
  private findLastUserMessageIndex(messages: AgentMessageDocument[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === AgentMessageRole.USER) {
        return i;
      }
    }
    return -1;
  }
  buildMemoryEntriesForResponse(memoryEntries: AgentMemoryDocument[]) {
    return memoryEntries.map((memory) => {
      const timedMemory = memory as AgentMemoryDocument & { createdAt?: Date };
      const influence = this.readMemoryInfluence(memory);

      return {
        confidence: memory.confidence,
        content: memory.content,
        contentType: memory.contentType,
        createdAt: timedMemory.createdAt?.toISOString(),
        generationInfluence: influence,
        id: memory.id,
        importance: memory.importance,
        kind: memory.kind,
        platform: memory.platform,
        scope: memory.scope,
        sourceContentId: memory.sourceContentId,
        sourceMessageId: memory.sourceMessageId,
        sourceType: memory.sourceType,
        sourceUrl: memory.sourceUrl,
        summary: memory.summary,
        tags: memory.tags ?? [],
      };
    });
  }

  buildMemoryInfluenceMetadata(memoryEntries: AgentMemoryDocument[]) {
    const entries = this.buildMemoryEntriesForResponse(memoryEntries)
      .filter((entry) => entry.generationInfluence)
      .map((entry) => ({
        confidence: entry.confidence,
        contentType: entry.contentType,
        id: entry.id,
        kind: entry.kind,
        platform: entry.platform,
        reasons: entry.generationInfluence?.reasons ?? [],
        score: entry.generationInfluence?.score ?? 0,
        sourceType: entry.sourceType,
        summary: entry.summary || entry.content?.slice(0, 160),
      }));

    if (entries.length === 0) {
      return {
        entries: [],
        mode: 'new_exploration',
        rankingStrategy: [
          'platform',
          'contentType',
          'recency',
          'confidence',
          'performanceRelevance',
        ],
        summary:
          'No relevant prior feedback memory matched this generation request.',
      };
    }

    const winningCount = entries.filter((entry) =>
      ['pattern', 'winner', 'positive_example'].includes(String(entry.kind)),
    ).length;

    return {
      entries,
      mode: winningCount > 0 ? 'prior_winning_patterns' : 'prior_feedback',
      rankingStrategy: [
        'platform',
        'contentType',
        'recency',
        'confidence',
        'performanceRelevance',
        'queryTerms',
      ],
      summary: `Using ${entries.length} prior feedback ${
        entries.length === 1 ? 'memory' : 'memories'
      } before generation.`,
    };
  }

  private buildMemoryPromptSections(memories: AgentMemoryDocument[]): string {
    const sections = new Map<string, string[]>();
    const order = [
      'User Preferences',
      'Saved Instructions',
      'Winning Patterns',
      'Reference Examples',
      'Avoid These Patterns',
    ];

    for (const memory of memories) {
      const section = this.resolveMemorySection(memory);
      const line = this.formatMemoryLine(memory);

      if (!line) {
        continue;
      }

      const bucket = sections.get(section) ?? [];
      bucket.push(line);
      sections.set(section, bucket);
    }

    const rendered = order
      .filter((section) => sections.has(section))
      .map((section) => `## ${section}\n${sections.get(section)?.join('\n')}`)
      .join('\n\n');

    return rendered
      ? `Saved memory to consider:\n\n${UNTRUSTED_USER_DATA_FRAMING}\n\n${rendered}`
      : '';
  }

  private resolveMemorySection(memory: AgentMemoryDocument): string {
    switch (memory.kind) {
      case 'negative_example':
        return 'Avoid These Patterns';
      case 'winner':
      case 'pattern':
        return 'Winning Patterns';
      case 'reference':
      case 'positive_example':
        return 'Reference Examples';
      case 'preference':
        return 'User Preferences';
      default:
        return 'Saved Instructions';
    }
  }

  private formatMemoryLine(memory: AgentMemoryDocument): string {
    const base = sanitizeAgentUntrustedInput(
      (memory.summary || memory.content || '').trim().replace(/\s+/g, ' '),
    );

    if (!base) {
      return '';
    }

    const qualifiers: string[] = [];
    if (memory.contentType && memory.contentType !== 'generic') {
      qualifiers.push(memory.contentType);
    }
    if (memory.platform) {
      qualifiers.push(memory.platform);
    }
    if (memory.scope === 'brand') {
      qualifiers.push('brand');
    }

    const prefix = qualifiers.length ? `[${qualifiers.join(' / ')}] ` : '';
    const snippet = base.length > 220 ? `${base.slice(0, 217)}...` : base;
    const influence = this.readMemoryInfluence(memory);
    const topReason = influence?.reasons[0];
    const influenceSuffix = influence
      ? ` (score ${influence.score.toFixed(1)}${topReason ? `; ${topReason}` : ''})`
      : '';
    return `- ${prefix}${snippet}${influenceSuffix}`;
  }

  private readMemoryInfluence(
    memory: AgentMemoryDocument,
  ): AgentFeedbackMemoryInfluence | undefined {
    return (memory as Partial<AgentFeedbackMemoryDocument>).generationInfluence;
  }

  private inferMemoryContentType(content: string): string {
    const normalized = content.toLowerCase();

    if (
      normalized.includes('newsletter') ||
      normalized.includes('substack') ||
      normalized.includes('beehiiv') ||
      normalized.includes('ghost')
    ) {
      return 'newsletter';
    }

    if (normalized.includes('thread')) {
      return 'thread';
    }

    if (normalized.includes('tweet') || normalized.includes('x post')) {
      return 'tweet';
    }

    if (normalized.includes('article') || normalized.includes('blog')) {
      return 'article';
    }

    if (normalized.includes('post')) {
      return 'post';
    }

    return 'generic';
  }

  private inferSkillModality(request: AgentChatRequest): string | undefined {
    if (request.agentType === AgentType.IMAGE_CREATOR) {
      return 'image';
    }

    if (
      request.agentType === AgentType.VIDEO_CREATOR ||
      request.agentType === AgentType.AI_AVATAR
    ) {
      return 'video';
    }

    const contentFormat = request.pageContext?.contentFormat?.toLowerCase();
    if (contentFormat?.includes('image')) {
      return 'image';
    }
    if (contentFormat?.includes('video')) {
      return 'video';
    }

    const hasImageAttachment = request.attachments?.some(
      (attachment) => attachment.kind === 'image',
    );
    if (hasImageAttachment) {
      return 'image';
    }

    return 'text';
  }

  /**
   * Inject campaign context (brief + recent peer messages) into the system prompt.
   * Called when a strategy is part of a campaign for coordination.
   */
  async injectCampaignContext(
    campaignId: string,
    organizationId: string,
    existingPrompt: string | undefined,
  ): Promise<string | undefined> {
    try {
      const campaign = await this.agentCampaignsService?.findOneById(
        campaignId,
        organizationId,
      );

      if (!campaign) {
        return existingPrompt;
      }

      const recentMessages =
        await this.agentMessageBusService?.getRecentMessages(campaignId, 10);

      const campaignSection = [
        '\n\n## Campaign Coordination',
        `You are part of campaign: "${campaign.label}"`,
        campaign.brief ? `Campaign Brief: ${campaign.brief}` : '',
        `Campaign Status: ${campaign.status}`,
        `Credits Used: ${campaign.creditsUsed} / ${campaign.creditsAllocated} allocated`,
        campaign.agents.length > 1
          ? `Other agents in this campaign: ${campaign.agents.length - 1}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      let peerMessagesSection = '';
      if (recentMessages && recentMessages.length > 0) {
        const messageLines = recentMessages.map(
          (msg) =>
            `- [${msg.type}] Agent ${msg.agentId}: ${JSON.stringify(msg.payload)}`,
        );
        peerMessagesSection = `\n\n## Recent Peer Activity\n${messageLines.join('\n')}`;
      }

      const basePrompt = existingPrompt || '';
      return `${basePrompt}${campaignSection}${peerMessagesSection}`;
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} failed to inject campaign context`,
        error,
      );
      return existingPrompt;
    }
  }
}
