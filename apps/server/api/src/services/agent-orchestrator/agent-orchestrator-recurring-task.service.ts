import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import { DEFAULT_AGENT_CHAT_MODEL } from '@api/services/agent-orchestrator/constants/agent-default-model.constant';
import type {
  AgentChatContext,
  AgentChatResult,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  extractRecurringContentCount,
  extractStyleNotes,
} from '@api/services/agent-orchestrator/utils/agent-orchestrator-input-parsing.util';
import { buildResolvedModelMetadata } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import {
  buildAgentScopeMetadata,
  recordAgentRunScope,
} from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import {
  buildFallbackThreadTitle,
  maybeUpdateThreadTitle,
} from '@api/services/agent-orchestrator/utils/agent-thread-title.util';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentMessageRole } from '@genfeedai/enums';
import { AgentToolName, type ValidatedAgentScope } from '@genfeedai/interfaces';
import { TIMEZONES } from '@helpers/formatting/timezone/timezone.helper';
import { Injectable, Optional } from '@nestjs/common';
import { Effect } from 'effect';

type RecurringTaskContentType = 'image' | 'video' | 'post' | 'newsletter';
type RecurringTaskInputField = 'prompt' | 'schedule' | 'variationBrief';
type ParsedRecurringSchedule = {
  schedule: string;
  timezone?: string;
};

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

@Injectable()
export class AgentOrchestratorRecurringTaskService {
  constructor(
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly toolExecutorService: AgentToolExecutorService,
    private readonly completionCardBuilder: AgentCompletionCardBuilderService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly organizationsService: OrganizationsService,
    private readonly streamPublisher: AgentStreamPublisherService,
    private readonly streamEffects: AgentStreamEffectsService,
    private readonly agentRunsService: AgentRunsService,
    @Optional()
    private readonly agentRuntimeSessionService?: AgentRuntimeSessionService,
  ) {}

  async resumeRecurringTaskDraftFromInput(params: {
    answer: string;
    fieldId?: string;
    organizationId: string;
    runId?: string;
    scope: ValidatedAgentScope;
    threadId: string;
    userId: string;
  }): Promise<void> {
    const binding = await runEffectPromise(
      this.getRuntimeBindingEffect(params.threadId, params.organizationId),
    );
    const resumeCursor = this.readRecurringTaskResumeCursor(
      binding?.resumeCursor as Record<string, unknown> | undefined,
    );

    if (!resumeCursor) {
      return;
    }

    const draft = { ...resumeCursor.draft };
    const fieldId = (params.fieldId ?? resumeCursor.awaitingField) as
      | RecurringTaskInputField
      | undefined;
    if (!fieldId) {
      return;
    }

    this.applyRecurringTaskAnswer(draft, fieldId, params.answer);

    const context: AgentChatContext = {
      organizationId: params.organizationId,
      runId: params.runId ?? binding?.runId,
      scope: params.scope,
      userId: params.userId,
    };
    await recordAgentRunScope(this.agentRunsService, context);

    const assistantResponse = await this.processRecurringTaskDraft({
      context,
      draft,
      model: binding?.model ?? DEFAULT_AGENT_CHAT_MODEL,
      threadId: params.threadId,
    });

    if (!assistantResponse) {
      return;
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
      await runEffectPromise(
        this.streamEffects.publishStreamDoneOnlyEffect({
          content: assistantResponse.content,
          context,
          creditsRemaining,
          creditsUsed: assistantResponse.creditsUsed,
          metadata: assistantResponse.metadata,
          startedAt: new Date().toISOString(),
          threadId: params.threadId,
          toolCalls: [],
        }),
      );
    }
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
      runId: params.context.runId,
      threadId: params.threadId,
    });
    await this.threadEventRecorder.recordRunCompleted({
      context: params.context,
      detail: 'Recurring automation setup completed',
      runId: params.context.runId,
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

    await runEffectPromise(
      this.streamEffects.publishStreamDoneOnlyEffect({
        content: assistantResponse.content,
        context: params.context,
        creditsRemaining,
        creditsUsed: assistantResponse.creditsUsed,
        metadata: assistantMetadata,
        startedAt: params.startedAt,
        threadId: params.threadId,
        toolCalls: [],
      }),
    );

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
    const binding = await runEffectPromise(
      this.getRuntimeBindingEffect(
        params.threadId,
        params.context.organizationId,
      ),
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
      AgentToolName.CREATE_WORKFLOW,
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
        brandId: params.context.scope?.brandId,
        organizationId: params.context.organizationId,
        runId: params.context.runId,
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
                    toolName: AgentToolName.CREATE_WORKFLOW,
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

    await runEffectPromise(
      this.streamEffects.publishStreamInputRequestEffect({
        ...config,
        context,
        fieldId,
        inputRequestId,
        metadata: {
          flow: 'recurring_workflow_setup',
        },
        runId: context.runId,
        threadId,
      }),
    );
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

    await runEffectPromise(
      this.upsertRuntimeBindingEffect({
        organizationId: context.organizationId,
        resumeCursor,
        runId: context.runId,
        status: completedAt
          ? 'completed'
          : awaitingField
            ? 'waiting_input'
            : 'running',
        threadId,
      }),
    );
  }

  private readRecurringTaskResumeCursor(
    resumeCursor: Record<string, unknown> | undefined,
  ): RecurringTaskResumeCursor | null {
    if (!resumeCursor || resumeCursor.kind !== 'recurring_workflow_setup') {
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
      normalized.includes('every day') ||
      normalized.includes('daily') ||
      normalized.includes('every week') ||
      normalized.includes('weekly') ||
      normalized.includes('recurring');
    const hasAssetSignal = /(image|video|post|newsletter)/.test(normalized);

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
    const platformMatch = normalized.match(
      /\b(instagram|tiktok|linkedin|x|twitter|facebook)\b/,
    );
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
      .replace(/\bcreate\b/gi, '')
      .replace(/\bmake\b/gi, '')
      .replace(/\bgenerate\b/gi, '')
      .replace(/\bset up\b/gi, '')
      .replace(/\brecurring\b/gi, '')
      .replace(/\bfor instagram\b/gi, '')
      .replace(/\bon instagram\b/gi, '')
      .replace(/\binstagram\b/gi, '')
      .replace(/\bfor tiktok\b/gi, '')
      .replace(/\bon tiktok\b/gi, '')
      .replace(/\btiktok\b/gi, '')
      .replace(/\bfor linkedin\b/gi, '')
      .replace(/\bon linkedin\b/gi, '')
      .replace(/\blinkedin\b/gi, '')
      .replace(/\bfor facebook\b/gi, '')
      .replace(/\bon facebook\b/gi, '')
      .replace(/\bfacebook\b/gi, '')
      .replace(/\bfor twitter\b/gi, '')
      .replace(/\bon twitter\b/gi, '')
      .replace(/\btwitter\b/gi, '')
      .replace(/\bfor x\b/gi, '')
      .replace(/\bon x\b/gi, '')
      .replace(/\bx\b/gi, '')
      .replace(/\b\d{1,2}\s+(images?|videos?|posts?|newsletters?)\b/gi, '')
      .replace(/\bimages?\b/gi, '')
      .replace(/\bvideos?\b/gi, '')
      .replace(/\bposts?\b/gi, '')
      .replace(/\bnewsletters?\b/gi, '')
      .replace(
        /\b(?:every day|daily|every weekday|weekdays|each month|every month|every week|weekly)(?:.*)$/i,
        '',
      )
      .replace(/\bin\s+an?\s+.+?\s+style\b/gi, '')
      .replace(/\bwith\s+an?\s+.+?\s+style\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(for|about|around)\s+/i, '');

    return cleaned.length >= 8 ? cleaned : undefined;
  }

  private extractStyleNotesFromMessage(content: string): string | undefined {
    return extractStyleNotes(content);
  }

  private extractCronScheduleFromMessage(
    content: string,
  ): ParsedRecurringSchedule | null {
    const timezone = this.extractTimezoneFromMessage(content);
    const extractTime = (
      match: RegExpMatchArray,
    ): { hour: number; minute: number } => {
      const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
      let hour = Number.parseInt(match[1], 10);
      const meridiem = match[3];

      if (meridiem === 'pm' && hour < 12) {
        hour += 12;
      }
      if (meridiem === 'am' && hour === 12) {
        hour = 0;
      }

      return { hour, minute };
    };

    const dailyMatch = content.match(
      /\b(?:every day|daily)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );

    if (dailyMatch) {
      const { hour, minute } = extractTime(dailyMatch);
      return { schedule: `${minute} ${hour} * * *`, timezone };
    }

    const weekdayMatch = content.match(
      /\b(?:every weekday|weekdays)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );
    if (weekdayMatch) {
      const { hour, minute } = extractTime(weekdayMatch);
      return { schedule: `${minute} ${hour} * * 1-5`, timezone };
    }

    const weeklyMatch = content.match(
      /\b(?:every|each)(?:\s+week)?\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );
    if (weeklyMatch) {
      const weekdayMap: Record<string, number> = {
        friday: 5,
        monday: 1,
        saturday: 6,
        sunday: 0,
        thursday: 4,
        tuesday: 2,
        wednesday: 3,
      };
      const minute = weeklyMatch[3] ? Number.parseInt(weeklyMatch[3], 10) : 0;
      let hour = Number.parseInt(weeklyMatch[2], 10);
      const meridiem = weeklyMatch[4];
      if (meridiem === 'pm' && hour < 12) {
        hour += 12;
      }
      if (meridiem === 'am' && hour === 12) {
        hour = 0;
      }

      return {
        schedule: `${minute} ${hour} * * ${weekdayMap[weeklyMatch[1]]}`,
        timezone,
      };
    }

    const monthlyMatch = content.match(
      /\b(?:every|each)\s+month(?:\s+on)?\s+(?:day\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );
    if (monthlyMatch) {
      const minute = monthlyMatch[3] ? Number.parseInt(monthlyMatch[3], 10) : 0;
      let hour = Number.parseInt(monthlyMatch[2], 10);
      const meridiem = monthlyMatch[4];
      if (meridiem === 'pm' && hour < 12) {
        hour += 12;
      }
      if (meridiem === 'am' && hour === 12) {
        hour = 0;
      }

      return {
        schedule: `${minute} ${hour} ${monthlyMatch[1]} * *`,
        timezone,
      };
    }

    return null;
  }

  private extractTimezoneFromMessage(content: string): string | undefined {
    const ianaMatch = content.match(/\b([a-z]+\/[a-z_]+(?:\/[a-z_]+)?)\b/i);
    if (ianaMatch?.[1]) {
      return ianaMatch[1];
    }

    const timezoneAliases: Record<string, string> = {
      cet: 'Europe/Paris',
      cst: 'America/Chicago',
      est: 'America/New_York',
      london: 'Europe/London',
      malta: 'Europe/Malta',
      paris: 'Europe/Paris',
      pst: 'America/Los_Angeles',
      utc: 'UTC',
    };

    for (const timezone of TIMEZONES) {
      const normalizedLabel = timezone.label.toLowerCase();
      if (
        content.includes(timezone.value.toLowerCase()) ||
        content.includes(normalizedLabel.split(' ')[0])
      ) {
        return timezone.value;
      }
    }

    for (const [alias, resolvedTimezone] of Object.entries(timezoneAliases)) {
      if (new RegExp(`\\b${alias}\\b`, 'i').test(content)) {
        return resolvedTimezone;
      }
    }

    return undefined;
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
    if (/distinct|different|varied|variety|novel|vary/i.test(normalized)) {
      draft.diversityMode = 'high';
    } else if (/consistent|same campaign|tight/i.test(normalized)) {
      draft.diversityMode = 'low';
    } else {
      draft.diversityMode = draft.diversityMode ?? 'medium';
    }
  }

  private async resolveOrganizationTimezone(
    organizationId: string,
  ): Promise<string> {
    const organization = await this.organizationsService.findOne({
      _id: organizationId,
      isDeleted: false,
    });
    const settings = organization?.settings as
      | { timezone?: string }
      | undefined;

    return settings?.timezone?.trim() || 'UTC';
  }

  private getRuntimeBindingEffect(
    threadId: string,
    organizationId: string,
  ): Effect.Effect<
    Awaited<ReturnType<AgentRuntimeSessionService['getBinding']>> | null,
    unknown
  > {
    if (!this.agentRuntimeSessionService) {
      return Effect.succeed(null);
    }

    return this.agentRuntimeSessionService.getBindingEffect(
      threadId,
      organizationId,
    );
  }

  private upsertRuntimeBindingEffect(params: {
    threadId: string;
    organizationId: string;
    runId?: string;
    model?: string;
    status: 'running' | 'waiting_input' | 'completed' | 'cancelled' | 'failed';
    resumeCursor?: Record<string, unknown>;
  }): Effect.Effect<void, unknown> {
    if (!this.agentRuntimeSessionService) {
      return Effect.void;
    }

    return this.agentRuntimeSessionService
      .upsertBindingEffect(params)
      .pipe(Effect.asVoid);
  }
}
