import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentModelAccessService } from '@api/services/agent-orchestrator/agent-model-access.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type {
  AgentChatContext,
  AgentChatResult,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  type ParsedCadencePhrase,
  parseCadencePhrase,
} from '@api/services/agent-orchestrator/utils/agent-cadence-phrase.util';
import type { AgentInitiatingPrincipal } from '@api/services/agent-orchestrator/utils/agent-initiating-principal.util';
import {
  extractRecurringContentCount,
  extractStyleNotes,
} from '@api/services/agent-orchestrator/utils/agent-orchestrator-input-parsing.util';
import { buildResolvedModelMetadata } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import { buildAgentScopeMetadata } from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import {
  buildFallbackThreadTitle,
  maybeUpdateThreadTitle,
} from '@api/services/agent-orchestrator/utils/agent-thread-title.util';
import {
  AgentRuntimeSessionService,
  getRuntimeBinding,
  upsertRuntimeBinding,
} from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentMessageRole } from '@genfeedai/contracts';
import { type ValidatedAgentScope } from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { Injectable, Optional } from '@nestjs/common';

const RECURRING_CADENCE_PATTERN =
  /\b(?:every|each)\s+(?:day|week|month|weekday|morning|afternoon|evening|night)\b/;
const CONTENT_TYPE_WORD_PATTERN = /(image|video|post|newsletter)/;
const PLATFORM_WORD_PATTERN =
  /\b(instagram|tiktok|linkedin|x|twitter|facebook)\b/;
const CREATE_WORD_PATTERN = /\bcreate\b/gi;
const MAKE_WORD_PATTERN = /\bmake\b/gi;
const GENERATE_WORD_PATTERN = /\bgenerate\b/gi;
const SET_UP_PHRASE_PATTERN = /\bset up\b/gi;
const RECURRING_WORD_PATTERN = /\brecurring\b/gi;
const FOR_INSTAGRAM_PHRASE_PATTERN = /\bfor instagram\b/gi;
const ON_INSTAGRAM_PHRASE_PATTERN = /\bon instagram\b/gi;
const INSTAGRAM_WORD_PATTERN = /\binstagram\b/gi;
const FOR_TIKTOK_PHRASE_PATTERN = /\bfor tiktok\b/gi;
const ON_TIKTOK_PHRASE_PATTERN = /\bon tiktok\b/gi;
const TIKTOK_WORD_PATTERN = /\btiktok\b/gi;
const FOR_LINKEDIN_PHRASE_PATTERN = /\bfor linkedin\b/gi;
const ON_LINKEDIN_PHRASE_PATTERN = /\bon linkedin\b/gi;
const LINKEDIN_WORD_PATTERN = /\blinkedin\b/gi;
const FOR_FACEBOOK_PHRASE_PATTERN = /\bfor facebook\b/gi;
const ON_FACEBOOK_PHRASE_PATTERN = /\bon facebook\b/gi;
const FACEBOOK_WORD_PATTERN = /\bfacebook\b/gi;
const FOR_TWITTER_PHRASE_PATTERN = /\bfor twitter\b/gi;
const ON_TWITTER_PHRASE_PATTERN = /\bon twitter\b/gi;
const TWITTER_WORD_PATTERN = /\btwitter\b/gi;
const FOR_X_PHRASE_PATTERN = /\bfor x\b/gi;
const ON_X_PHRASE_PATTERN = /\bon x\b/gi;
const X_WORD_PATTERN = /\bx\b/gi;
const CONTENT_COUNT_PHRASE_PATTERN =
  /\b\d{1,2}\s+(images?|videos?|posts?|newsletters?)\b/gi;
const IMAGES_WORD_PATTERN = /\bimages?\b/gi;
const VIDEOS_WORD_PATTERN = /\bvideos?\b/gi;
const POSTS_WORD_PATTERN = /\bposts?\b/gi;
const NEWSLETTERS_WORD_PATTERN = /\bnewsletters?\b/gi;
const CADENCE_PHRASE_PATTERN =
  /\b(?:(?:every|each)\s+(?:day|weekday|week|month|morning|afternoon|evening|night)|daily|weekly|monthly|weekdays)(?:.*)$/i;
const IN_STYLE_PHRASE_PATTERN = /\bin\s+an?\s+.+?\s+style\b/gi;
const WITH_STYLE_PHRASE_PATTERN = /\bwith\s+an?\s+.+?\s+style\b/gi;
const WHITESPACE_RUNS_PATTERN = /\s+/g;
const LEADING_PREPOSITION_PATTERN = /^(for|about|around)\s+/i;
const VARIETY_ANSWER_PATTERN = /distinct|different|varied|variety|novel|vary/i;
const CONSISTENCY_ANSWER_PATTERN = /consistent|same campaign|tight/i;

type RecurringTaskContentType = 'image' | 'video' | 'post' | 'newsletter';
type RecurringTaskInputField = 'prompt' | 'schedule' | 'variationBrief';

interface RecurringTaskDraft extends Record<string, unknown> {
  contentType: RecurringTaskContentType;
  count: number;
  diversityMode?: 'low' | 'medium' | 'high';
  negativePrompt?: string;
  platform?: string;
  prompt?: string;
  schedule?: string;
  styleNotes?: string;
  workflowLabel?: string;
  timezone?: string;
}

interface RecurringTaskResumeCursor extends Record<string, unknown> {
  awaitingField?: RecurringTaskInputField;
  completedAt?: string;
  draft: RecurringTaskDraft;
  kind: 'recurring_workflow_setup';
  lastRequestId?: string;
  updatedAt: string;
}

@Traced()
@Injectable()
export class AgentOrchestratorRecurringTaskService {
  constructor(
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly agentModelAccess: AgentModelAccessService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly toolExecutorService: AgentToolExecutorService,
    private readonly completionCardBuilder: AgentCompletionCardBuilderService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly streamPublisher: AgentStreamPublisherService,
    private readonly streamEffects: AgentStreamEffectsService,
    @Optional()
    private readonly agentRuntimeSessionService?: AgentRuntimeSessionService,
  ) {}

  async resumeRecurringTaskDraftFromInput(params: {
    answer: string;
    fieldId?: string;
    initiatingPrincipal?: AgentInitiatingPrincipal;
    organizationId: string;
    executionId?: string;
    scope: ValidatedAgentScope;
    threadId: string;
    userId: string;
  }): Promise<boolean> {
    const binding = await getRuntimeBinding(
      this.agentRuntimeSessionService,
      params.threadId,
      params.organizationId,
    );
    const resumeCursor = this.readRecurringTaskResumeCursor(
      binding?.resumeCursor as Record<string, unknown> | undefined,
    );

    if (!resumeCursor) {
      return false;
    }

    const draft = { ...resumeCursor.draft };
    const fieldId = (params.fieldId ?? resumeCursor.awaitingField) as
      | RecurringTaskInputField
      | undefined;
    if (!fieldId) {
      return false;
    }

    this.applyRecurringTaskAnswer(draft, fieldId, params.answer);

    const context: AgentChatContext = {
      executionId: params.executionId,
      ...(params.initiatingPrincipal
        ? { initiatingPrincipal: params.initiatingPrincipal }
        : {}),
      organizationId: params.organizationId,
      scope: params.scope,
      userId: params.userId,
    };
    const assistantResponse = await this.processRecurringTaskDraft({
      context,
      draft,
      // Runtime bindings outlive the catalogue — a binding pinned to a retired
      // key has to map forward here, since this path calls the model directly
      // instead of going through the orchestrator's resolution chokepoint.
      // It also bypasses the free-tier lock chokepoint, so enforce it here.
      model: await this.agentModelAccess.enforceModel(
        params.organizationId,
        await this.agentChatModelRegistry.resolveModelKey(binding?.model),
      ),
      threadId: params.threadId,
    });

    if (!assistantResponse) {
      return false;
    }

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.organizationId,
      );

    await this.agentMessagesService.addMessage({
      brandId: context.scope?.brandId,
      content: assistantResponse.content,
      metadata: {
        ...buildAgentScopeMetadata(context),
        ...assistantResponse.metadata,
        creditsRemaining,
      },
      organizationId: params.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.userId,
    });

    if (this.streamPublisher) {
      await this.streamEffects.publishStreamDoneOnly({
        content: assistantResponse.content,
        context,
        creditsRemaining,
        creditsUsed: assistantResponse.creditsUsed,
        metadata: assistantResponse.metadata,
        startedAt: new Date().toISOString(),
        threadId: params.threadId,
        toolCalls: [],
      });
    }
    return true;
  }

  async tryHandleRecurringTaskDraftTurn(params: {
    context: AgentChatContext;
    model: string;
    requestContent: string;
    seedTitle: string;
    threadId: string;
  }): Promise<AgentChatResult | null> {
    const assistantResponse =
      await this.prepareRecurringTaskDraftResponse(params);

    if (!assistantResponse) {
      return null;
    }

    await maybeUpdateThreadTitle({
      agentThreadsService: this.agentThreadsService,
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: buildFallbackThreadTitle(params.requestContent),
    });

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...buildAgentScopeMetadata(params.context),
      ...assistantResponse.metadata,
      creditsRemaining,
      totalCreditsUsed: assistantResponse.creditsUsed,
    };

    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content: assistantResponse.content,
      metadata: assistantMetadata,
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.context.userId,
    });
    await this.threadEventRecorder.recordAssistantFinalized({
      content: assistantResponse.content,
      context: params.context,
      metadata: assistantMetadata,
      runId: params.context.executionId,
      threadId: params.threadId,
    });
    await this.threadEventRecorder.recordRunCompleted({
      context: params.context,
      detail: 'Recurring automation setup completed',
      runId: params.context.executionId,
      threadId: params.threadId,
    });

    return {
      creditsRemaining,
      creditsUsed: assistantResponse.creditsUsed,
      message: {
        content: assistantResponse.content,
        metadata: assistantMetadata,
        role: 'assistant',
      },
      threadId: params.threadId,
      toolCalls: [],
    };
  }

  async tryHandleRecurringTaskDraftTurnStream(params: {
    context: AgentChatContext;
    model: string;
    requestContent: string;
    seedTitle: string;
    startedAt: string;
    threadId: string;
  }): Promise<boolean> {
    const assistantResponse =
      await this.prepareRecurringTaskDraftResponse(params);

    if (!assistantResponse) {
      return false;
    }

    await maybeUpdateThreadTitle({
      agentThreadsService: this.agentThreadsService,
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: buildFallbackThreadTitle(params.requestContent),
    });

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...buildAgentScopeMetadata(params.context),
      ...assistantResponse.metadata,
      creditsRemaining,
      totalCreditsUsed: assistantResponse.creditsUsed,
    };

    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content: assistantResponse.content,
      metadata: assistantMetadata,
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.context.userId,
    });

    await this.streamEffects.publishStreamDoneOnly({
      content: assistantResponse.content,
      context: params.context,
      creditsRemaining,
      creditsUsed: assistantResponse.creditsUsed,
      metadata: assistantMetadata,
      startedAt: params.startedAt,
      threadId: params.threadId,
      toolCalls: [],
    });

    return true;
  }

  private async prepareRecurringTaskDraftResponse(params: {
    context: AgentChatContext;
    model: string;
    requestContent: string;
    threadId: string;
  }): Promise<{
    content: string;
    creditsUsed: number;
    metadata: Record<string, unknown>;
  } | null> {
    const binding = await getRuntimeBinding(
      this.agentRuntimeSessionService,
      params.threadId,
      params.context.organizationId,
    );
    const activeDraft = this.readRecurringTaskResumeCursor(
      binding?.resumeCursor as Record<string, unknown> | undefined,
    );
    const isRecurringIntent = this.isRecurringTaskIntent(params.requestContent);

    if (!activeDraft && !isRecurringIntent) {
      return null;
    }

    const defaultTimezone = await this.resolveOrganizationTimezone(
      params.context.organizationId,
    );
    const draft = activeDraft
      ? { ...activeDraft.draft }
      : this.extractRecurringTaskDraftFromMessage(
          params.requestContent,
          defaultTimezone,
        );

    return await this.processRecurringTaskDraft({
      context: params.context,
      draft,
      model: params.model,
      threadId: params.threadId,
    });
  }

  private async processRecurringTaskDraft(params: {
    context: AgentChatContext;
    draft: RecurringTaskDraft;
    model: string;
    threadId: string;
  }): Promise<{
    content: string;
    creditsUsed: number;
    metadata: Record<string, unknown>;
  } | null> {
    const missingField = this.getNextRecurringTaskField(params.draft);

    if (missingField) {
      await this.persistRecurringTaskDraft(
        params.threadId,
        params.context,
        params.draft,
        missingField,
      );
      await this.publishRecurringTaskInputRequest(
        params.threadId,
        params.context,
        params.draft,
        missingField,
      );

      return {
        content:
          missingField === 'prompt'
            ? 'I need the core generation brief before I create this recurring automation.'
            : missingField === 'schedule'
              ? 'I need the cadence for this recurring automation before I create it.'
              : 'I need one more creative constraint so each run stays useful instead of producing near-duplicates.',
        creditsUsed: 0,
        metadata: buildResolvedModelMetadata(params.model),
      };
    }
    const result = await this.toolExecutorService.executeTool(
      'create_workflow',
      {
        contentType: params.draft.contentType,
        count: params.draft.count,
        diversityMode: params.draft.diversityMode ?? 'medium',
        label: params.draft.workflowLabel,
        negativePrompt: params.draft.negativePrompt,
        prompt: params.draft.prompt,
        schedule: params.draft.schedule,
        styleNotes: params.draft.styleNotes,
        timezone: params.draft.timezone,
      },
      {
        apiKeyContext: params.context.apiKeyContext,
        initiatingPrincipal: params.context.initiatingPrincipal,
        brandId: params.context.scope?.brandId,
        organizationId: params.context.organizationId,
        runId: params.context.executionId,
        validatedScope: params.context.scope,
        threadId: params.threadId,
        userId: params.context.userId,
      },
    );

    await this.persistRecurringTaskDraft(
      params.threadId,
      params.context,
      params.draft,
      undefined,
      new Date().toISOString(),
    );

    return {
      content: result.success
        ? 'Recurring automation created.'
        : (result.error ?? 'Failed to create the recurring automation.'),
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      metadata: result.success
        ? (() => {
            const enhancedUiActions =
              this.completionCardBuilder.buildAssistantUiActions({
                reviewRequired: result.requiresConfirmation ?? false,
                toolCalls: [
                  {
                    status: 'completed',
                    toolName: 'create_workflow',
                  },
                ],
                uiActions: result.nextActions ?? [],
              });

            return {
              ...buildResolvedModelMetadata(params.model),
              reviewRequired: result.requiresConfirmation ?? false,
              riskLevel: result.riskLevel ?? 'low',
              ...(enhancedUiActions.suggestedActions.length
                ? { suggestedActions: enhancedUiActions.suggestedActions }
                : {}),
              uiActions: enhancedUiActions.uiActions,
            };
          })()
        : buildResolvedModelMetadata(params.model),
    };
  }

  private async publishRecurringTaskInputRequest(
    threadId: string,
    context: AgentChatContext,
    draft: RecurringTaskDraft,
    fieldId: RecurringTaskInputField,
  ): Promise<void> {
    if (!this.streamPublisher) {
      return;
    }

    const inputRequestId = `recurring-workflow:${threadId}:${fieldId}:${Date.now()}`;
    const config =
      fieldId === 'prompt'
        ? {
            allowFreeText: true,
            prompt:
              'What should these assets actually communicate or promote? Be specific about the product, campaign, or offer.',
            title: 'Define the recurring brief',
          }
        : fieldId === 'schedule'
          ? {
              allowFreeText: true,
              prompt:
                'What cadence should this run on? Example: every day at 5pm or every weekday at 9am.',
              title: 'Confirm the schedule',
            }
          : {
              allowFreeText: true,
              options: [
                {
                  description:
                    'Best default for recurring social batches with one campaign direction.',
                  id: 'same-campaign-varied-concepts',
                  label:
                    'Keep the campaign consistent, vary concept and composition',
                },
                {
                  description:
                    'Use this when you want stronger novelty between each asset in a run.',
                  id: 'distinct-directions',
                  label: 'Push each asset into a more distinct direction',
                },
              ],
              prompt:
                'What should stay consistent across the batch, and what should vary between each asset?',
              recommendedOptionId: 'same-campaign-varied-concepts',
              title: 'Set the variation strategy',
            };

    await this.persistRecurringTaskDraft(
      threadId,
      context,
      draft,
      fieldId,
      undefined,
      inputRequestId,
    );

    await this.streamEffects.publishStreamInputRequest({
      ...config,
      context,
      fieldId,
      inputRequestId,
      metadata: {
        flow: 'recurring_workflow_setup',
      },
      runId: context.executionId,
      threadId,
    });
  }

  private async persistRecurringTaskDraft(
    threadId: string,
    context: AgentChatContext,
    draft: RecurringTaskDraft,
    awaitingField?: RecurringTaskInputField,
    completedAt?: string,
    lastRequestId?: string,
  ): Promise<void> {
    const resumeCursor: RecurringTaskResumeCursor = {
      ...(awaitingField ? { awaitingField } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(lastRequestId ? { lastRequestId } : {}),
      draft,
      kind: 'recurring_workflow_setup',
      updatedAt: new Date().toISOString(),
    };

    await upsertRuntimeBinding(this.agentRuntimeSessionService, {
      organizationId: context.organizationId,
      resumeCursor,
      runId: context.executionId,
      status: completedAt
        ? 'completed'
        : awaitingField
          ? 'waiting_input'
          : 'running',
      threadId,
    });
  }

  private readRecurringTaskResumeCursor(
    resumeCursor: Record<string, unknown> | undefined,
  ): RecurringTaskResumeCursor | null {
    if (resumeCursor?.kind !== 'recurring_workflow_setup') {
      return null;
    }

    const draft = resumeCursor.draft;
    if (!draft || typeof draft !== 'object') {
      return null;
    }

    return resumeCursor as RecurringTaskResumeCursor;
  }

  private isRecurringTaskIntent(content: string): boolean {
    const normalized = content.toLowerCase();
    const hasRecurringSignal =
      RECURRING_CADENCE_PATTERN.test(normalized) ||
      normalized.includes('daily') ||
      normalized.includes('weekly') ||
      normalized.includes('monthly') ||
      normalized.includes('weekdays') ||
      normalized.includes('recurring');
    const hasAssetSignal = CONTENT_TYPE_WORD_PATTERN.test(normalized);

    return hasRecurringSignal && hasAssetSignal;
  }

  private extractRecurringTaskDraftFromMessage(
    content: string,
    defaultTimezone: string,
  ): RecurringTaskDraft {
    const normalized = content.toLowerCase();
    const count = extractRecurringContentCount(normalized);
    const contentType = normalized.includes('video')
      ? 'video'
      : normalized.includes('newsletter')
        ? 'newsletter'
        : normalized.includes('post')
          ? 'post'
          : 'image';
    const platformMatch = normalized.match(PLATFORM_WORD_PATTERN);
    const parsedSchedule = this.extractCronScheduleFromMessage(normalized);

    return {
      contentType,
      count: count ?? 1,
      diversityMode: normalized.includes('distinct')
        ? 'high'
        : normalized.includes('consistent')
          ? 'low'
          : 'medium',
      platform: platformMatch?.[1],
      prompt: this.extractRecurringPromptFromMessage(content),
      schedule: parsedSchedule?.schedule,
      styleNotes: this.extractStyleNotesFromMessage(content),
      timezone: parsedSchedule?.timezone ?? defaultTimezone,
    };
  }

  private extractRecurringPromptFromMessage(
    content: string,
  ): string | undefined {
    const cleaned = content
      .replace(CREATE_WORD_PATTERN, '')
      .replace(MAKE_WORD_PATTERN, '')
      .replace(GENERATE_WORD_PATTERN, '')
      .replace(SET_UP_PHRASE_PATTERN, '')
      .replace(RECURRING_WORD_PATTERN, '')
      .replace(FOR_INSTAGRAM_PHRASE_PATTERN, '')
      .replace(ON_INSTAGRAM_PHRASE_PATTERN, '')
      .replace(INSTAGRAM_WORD_PATTERN, '')
      .replace(FOR_TIKTOK_PHRASE_PATTERN, '')
      .replace(ON_TIKTOK_PHRASE_PATTERN, '')
      .replace(TIKTOK_WORD_PATTERN, '')
      .replace(FOR_LINKEDIN_PHRASE_PATTERN, '')
      .replace(ON_LINKEDIN_PHRASE_PATTERN, '')
      .replace(LINKEDIN_WORD_PATTERN, '')
      .replace(FOR_FACEBOOK_PHRASE_PATTERN, '')
      .replace(ON_FACEBOOK_PHRASE_PATTERN, '')
      .replace(FACEBOOK_WORD_PATTERN, '')
      .replace(FOR_TWITTER_PHRASE_PATTERN, '')
      .replace(ON_TWITTER_PHRASE_PATTERN, '')
      .replace(TWITTER_WORD_PATTERN, '')
      .replace(FOR_X_PHRASE_PATTERN, '')
      .replace(ON_X_PHRASE_PATTERN, '')
      .replace(X_WORD_PATTERN, '')
      .replace(CONTENT_COUNT_PHRASE_PATTERN, '')
      .replace(IMAGES_WORD_PATTERN, '')
      .replace(VIDEOS_WORD_PATTERN, '')
      .replace(POSTS_WORD_PATTERN, '')
      .replace(NEWSLETTERS_WORD_PATTERN, '')
      .replace(CADENCE_PHRASE_PATTERN, '')
      .replace(IN_STYLE_PHRASE_PATTERN, '')
      .replace(WITH_STYLE_PHRASE_PATTERN, '')
      .replace(WHITESPACE_RUNS_PATTERN, ' ')
      .trim()
      .replace(LEADING_PREPOSITION_PATTERN, '');

    return cleaned.length >= 8 ? cleaned : undefined;
  }

  private extractStyleNotesFromMessage(content: string): string | undefined {
    return extractStyleNotes(content);
  }

  private extractCronScheduleFromMessage(
    content: string,
  ): ParsedCadencePhrase | null {
    return parseCadencePhrase(content);
  }

  private getNextRecurringTaskField(
    draft: RecurringTaskDraft,
  ): RecurringTaskInputField | null {
    if (!draft.prompt?.trim()) {
      return 'prompt';
    }
    if (!draft.schedule?.trim()) {
      return 'schedule';
    }
    if (!draft.styleNotes?.trim()) {
      return 'variationBrief';
    }
    return null;
  }

  private applyRecurringTaskAnswer(
    draft: RecurringTaskDraft,
    fieldId: RecurringTaskInputField,
    answer: string,
  ): void {
    const normalized = answer.trim();

    if (!normalized) {
      return;
    }

    if (fieldId === 'prompt') {
      draft.prompt = normalized;
      return;
    }

    if (fieldId === 'schedule') {
      const parsedSchedule = this.extractCronScheduleFromMessage(
        normalized.toLowerCase(),
      );
      draft.schedule = parsedSchedule?.schedule ?? normalized;
      draft.timezone = parsedSchedule?.timezone ?? draft.timezone;
      return;
    }

    draft.styleNotes = normalized;
    if (VARIETY_ANSWER_PATTERN.test(normalized)) {
      draft.diversityMode = 'high';
    } else if (CONSISTENCY_ANSWER_PATTERN.test(normalized)) {
      draft.diversityMode = 'low';
    } else {
      draft.diversityMode = draft.diversityMode ?? 'medium';
    }
  }

  private async resolveOrganizationTimezone(
    organizationId: string,
  ): Promise<string> {
    const settings = await this.organizationSettingsService.findOneSelect(
      { organizationId },
      { timezone: true },
    );

    return settings?.timezone?.trim() || 'UTC';
  }
}
