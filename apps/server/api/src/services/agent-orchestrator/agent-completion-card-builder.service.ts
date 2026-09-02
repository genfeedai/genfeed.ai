import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  AgentToolName,
  type AgentUiAction,
  type AgentUiActionCta,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

export interface AgentCompletionSuggestedAction {
  id: string;
  label: string;
  prompt: string;
  /** Optional one-line helper; omit for chip-style short labels. */
  description?: string;
}

export interface AgentCompletionToolCall {
  status: 'completed' | 'failed';
  toolName: string;
}

export interface BuildAssistantUiActionsParams {
  reviewRequired: boolean;
  toolCalls: AgentCompletionToolCall[];
  uiActions: AgentUiAction[];
}

export interface BuildAssistantUiActionsResult {
  suggestedActions: AgentCompletionSuggestedAction[];
  uiActions: AgentUiAction[];
}

interface BuildCompletionSummaryCardParams {
  suggestedActions: AgentCompletionSuggestedAction[];
  toolCalls: AgentCompletionToolCall[];
  uiActions: AgentUiAction[];
}

/**
 * Read/context tools that support clarify turns. Completing only these must
 * not emit a sticky "Done · Completed successfully" card — the assistant
 * prose is the answer.
 */
const CONTEXT_ONLY_COMPLETION_TOOLS = new Set<string>([
  AgentToolName.GET_CURRENT_BRAND,
  AgentToolName.LIST_BRANDS,
  AgentToolName.GET_CREDITS_BALANCE,
  AgentToolName.GET_CONNECTION_STATUS,
  AgentToolName.LIST_POSTS,
  AgentToolName.LIST_WORKFLOWS,
  AgentToolName.LIST_WORKFLOW_RUNS,
  AgentToolName.LIST_SYSTEM_WORKFLOW_CATALOG,
  AgentToolName.LIST_GENFEED_TOOLS,
  AgentToolName.LIST_REVIEW_QUEUE,
  AgentToolName.GET_APPROVAL_SUMMARY,
  AgentToolName.CHECK_ONBOARDING_STATUS,
  AgentToolName.GET_BRAND_COMPLETENESS,
  AgentToolName.GET_DASHBOARD_LAYOUT,
  AgentToolName.GET_CONTENT_CALENDAR,
  AgentToolName.CHECK_GOAL_PROGRESS,
  AgentToolName.INSPECT_WORKFLOW,
  AgentToolName.GET_WORKFLOW_RUN,
  AgentToolName.GET_WORKFLOW_INPUTS,
  AgentToolName.LIST_ADS_RESEARCH,
  AgentToolName.GET_AD_RESEARCH_DETAIL,
  AgentToolName.LIST_INSTAGRAM_INSPIRATION,
  AgentToolName.GET_INSTAGRAM_INSPIRATION_DETAIL,
  AgentToolName.GET_TOP_INGREDIENTS,
  AgentToolName.RESOLVE_HANDLE,
  AgentToolName.GET_ANALYTICS,
  AgentToolName.ANALYZE_PERFORMANCE,
  AgentToolName.GET_OUTREACH_SEQUENCE_ANALYTICS,
  AgentToolName.GET_TRENDS,
]);

@Injectable()
export class AgentCompletionCardBuilderService {
  buildAssistantUiActions(
    params: BuildAssistantUiActionsParams,
  ): BuildAssistantUiActionsResult {
    const uiActions = this.collapseOAuthConnectCards(params.uiActions);
    const collapsedParams = { ...params, uiActions };
    const suggestedActions =
      this.buildCompletionSuggestedActions(collapsedParams);
    const completionSummaryCard = this.buildCompletionSummaryCard({
      suggestedActions,
      toolCalls: params.toolCalls,
      uiActions,
    });

    return {
      suggestedActions,
      uiActions: completionSummaryCard
        ? [completionSummaryCard, ...uiActions]
        : uiActions,
    };
  }

  /**
   * A turn that probes `get_connection_status` once per platform emits one
   * `oauth_connect_card` per probe — six stacked cards for a single "what is
   * connected?" question. Collapse them into one picker card holding every
   * offered platform, in first-seen order, at the position of the first card.
   *
   * Mirrored on the client (`collapseOAuthConnectCards` in `@genfeedai/agent`)
   * so streamed turns and already-stored transcripts render the same way.
   */
  private collapseOAuthConnectCards(
    uiActions: AgentUiAction[],
  ): AgentUiAction[] {
    const connectCards = uiActions.filter(
      (action) => action.type === 'oauth_connect_card',
    );

    if (connectCards.length < 2) {
      return uiActions;
    }

    const platforms: string[] = [];
    connectCards.forEach((action) => {
      const candidates = action.platforms?.length
        ? action.platforms
        : [action.platform ?? ''];

      candidates.forEach((candidate) => {
        const normalized = candidate.trim().toLowerCase();
        if (normalized && !platforms.includes(normalized)) {
          platforms.push(normalized);
        }
      });
    });

    const [firstCard] = connectCards;
    const collapsed: AgentUiAction =
      platforms.length === 0
        ? // Every card was the platform-less generic picker: persist only the
          // first one, matching the client collapse behavior so stored turns
          // and streamed turns render the same way.
          firstCard
        : {
            ...firstCard,
            description:
              firstCard.description ??
              'Connect an account to unlock publishing and scheduling.',
            id: `oauth-connect-collapsed-${firstCard.id}`,
            platform: platforms.length === 1 ? platforms[0] : undefined,
            platforms,
            title:
              platforms.length === 1 ? firstCard.title : 'Connect an account',
          };

    let hasEmittedCollapsed = false;

    return uiActions.flatMap((action) => {
      if (action.type !== 'oauth_connect_card') {
        return [action];
      }

      if (hasEmittedCollapsed) {
        return [];
      }

      hasEmittedCollapsed = true;
      return [collapsed];
    });
  }

  private buildCompletionSecondaryCtas(
    suggestedActions: AgentCompletionSuggestedAction[],
  ): AgentUiActionCta[] {
    return suggestedActions.slice(0, 3).map((suggestion) => ({
      action: 'send_prompt',
      label: suggestion.label,
      payload: { prompt: suggestion.prompt },
    }));
  }

  private isWorkflowInstallConfirmation(action: AgentUiAction): boolean {
    if (action.ctas?.some((cta) => this.isConfirmInstallCta(cta))) {
      return true;
    }

    return !action.workflowId && action.title === 'Install official workflow?';
  }

  private isConfirmInstallCta(cta: AgentUiActionCta): boolean {
    return cta.action === 'confirm_install_official_workflow';
  }

  private selectInstalledWorkflowHrefCta(
    action: AgentUiAction,
  ): AgentUiActionCta | undefined {
    return action.ctas?.find(
      (cta) => typeof cta.href === 'string' && cta.href.trim().length > 0,
    );
  }

  private buildCompletionPrimaryCta(
    label: string,
    cta?: AgentUiActionCta,
  ): AgentUiActionCta | undefined {
    if (cta) {
      return {
        ...cta,
        href: this.normalizeAppHref(cta.href) ?? cta.href,
        label,
      };
    }

    // Content completions always need a review destination.
    if (label === 'Review Draft') {
      return { href: APP_ROUTES.PUBLISHING.REVIEW, label };
    }

    return undefined;
  }

  /**
   * Dead paths that brand-scoping turns into 404s
   * (e.g. `/review` → `/:org/:brand/review`). Map to real product routes.
   */
  private normalizeAppHref(href: string | undefined): string | undefined {
    if (!href?.trim()) {
      return undefined;
    }

    const trimmed = href.trim();
    const queryIndex = trimmed.search(/[?#]/);
    const path = queryIndex === -1 ? trimmed : trimmed.slice(0, queryIndex);
    const suffix = queryIndex === -1 ? '' : trimmed.slice(queryIndex);

    if (path === '/review') {
      return `${APP_ROUTES.PUBLISHING.REVIEW}${suffix}`;
    }

    if (path === '/calendar' || path === '/calendar/posts') {
      return `${APP_ROUTES.PUBLISHING.CALENDAR}${suffix}`;
    }

    if (path === '/drafts') {
      const draftSuffix = suffix.startsWith('?')
        ? `&${suffix.slice(1)}`
        : suffix;
      return `${APP_ROUTES.PUBLISHING.POSTS}?publicationState=not-posted${draftSuffix}`;
    }

    return trimmed;
  }

  private buildCompletionSummaryCard(
    params: BuildCompletionSummaryCardParams,
  ): AgentUiAction | null {
    const workflowAction = params.uiActions.find(
      (action) => action.type === 'workflow_created_card',
    );

    if (workflowAction && this.isWorkflowInstallConfirmation(workflowAction)) {
      return null;
    }

    if (workflowAction) {
      return {
        id: `completion-summary-${workflowAction.id}`,
        outcomeBullets: [
          'Automation ready to edit and run',
          workflowAction.workflowName
            ? `Workflow: ${workflowAction.workflowName}`
            : null,
          workflowAction.scheduleSummary ?? null,
        ].filter((bullet): bullet is string => Boolean(bullet)),
        primaryCta: this.buildCompletionPrimaryCta(
          'Use in Workflow',
          this.selectInstalledWorkflowHrefCta(workflowAction),
        ) ?? {
          href: workflowAction.workflowId
            ? `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflowAction.workflowId}`
            : APP_ROUTES.AUTOMATION.WORKFLOWS,
          label: 'Use in Workflow',
        },
        secondaryCtas: this.buildCompletionSecondaryCtas(
          params.suggestedActions,
        ),
        status: 'completed',
        summaryText: 'Created a recurring automation for this request.',
        title: 'Done',
        type: 'completion_summary_card',
      };
    }

    if (params.uiActions.length > 0) {
      return null;
    }

    const completedToolNames = params.toolCalls
      .filter((toolCall) => toolCall.status === 'completed')
      .map((toolCall) => toolCall.toolName)
      .filter((toolName): toolName is string => typeof toolName === 'string');

    // Productive tools only — pure context/read tools must not mint Done.
    const productiveToolNames = completedToolNames.filter(
      (toolName) => !CONTEXT_ONLY_COMPLETION_TOOLS.has(toolName),
    );

    if (productiveToolNames.length === 0) {
      return null;
    }

    const outcomeBullets = [
      `${productiveToolNames.length} tool action${productiveToolNames.length === 1 ? '' : 's'} completed`,
      ...productiveToolNames
        .slice(0, 3)
        .map((toolName) => `Tool: ${this.formatCompletionToolName(toolName)}`),
    ];

    return {
      id: `completion-summary-tools-${productiveToolNames[0] ?? 'generic'}`,
      outcomeBullets,
      secondaryCtas: this.buildCompletionSecondaryCtas(params.suggestedActions),
      status: 'completed',
      summaryText: 'Completed this request successfully.',
      title: 'Done',
      type: 'completion_summary_card',
    };
  }

  private formatCompletionToolName(toolName: string): string {
    return toolName
      .split('_')
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  private buildCompletionSuggestedActions(
    params: BuildAssistantUiActionsParams,
  ): AgentCompletionSuggestedAction[] {
    if (params.reviewRequired) {
      return [];
    }

    const completedToolNames = params.toolCalls
      .filter((toolCall) => toolCall.status === 'completed')
      .map((toolCall) => toolCall.toolName);

    if (completedToolNames.length === 0 && params.uiActions.length === 0) {
      return [];
    }

    const uiActionTypes = new Set(
      params.uiActions.map((action) => action.type),
    );
    const suggestions: AgentCompletionSuggestedAction[] = [];
    const seenPrompts = new Set<string>();

    const addSuggestion = (id: string, label: string, prompt: string): void => {
      if (seenPrompts.has(prompt) || suggestions.length >= 3) {
        return;
      }

      seenPrompts.add(prompt);
      suggestions.push({ id, label, prompt });
    };

    const hasCompletedTool = (...toolNames: string[]): boolean =>
      completedToolNames.some((toolName) => toolNames.includes(toolName));

    if (
      uiActionTypes.has('workflow_created_card') ||
      hasCompletedTool(
        AgentToolName.CREATE_WORKFLOW,
        'install_official_workflow',
      )
    ) {
      addSuggestion(
        'workflow-tune',
        'Tune this workflow',
        'Show me how to customize this automation for my brand and goals',
      );
      addSuggestion(
        'workflow-channel',
        'Add another channel',
        'Create a second automation for another channel using this workflow as the base',
      );
      addSuggestion(
        'workflow-schedule',
        'Review schedule',
        'Review the schedule for this automation and suggest the best posting windows',
      );
    }

    if (
      uiActionTypes.has('content_preview_card') ||
      uiActionTypes.has('batch_generation_card') ||
      uiActionTypes.has('batch_generation_result_card') ||
      uiActionTypes.has('clip_run_card') ||
      uiActionTypes.has('clip_workflow_run_card') ||
      hasCompletedTool(
        AgentToolName.GENERATE_CONTENT,
        AgentToolName.GENERATE_CONTENT_BATCH,
        AgentToolName.GENERATE_IMAGE,
        AgentToolName.GENERATE_VIDEO,
        AgentToolName.GENERATE_AS_IDENTITY,
        AgentToolName.GENERATE_VOICE,
      )
    ) {
      addSuggestion(
        'content-variations',
        'Make variations',
        'Make three stronger variations of this result',
      );
      addSuggestion(
        'content-publish',
        'Turn this into a post',
        'Turn this result into a publish-ready post with caption and CTA',
      );
      addSuggestion(
        'content-analyze',
        'Pressure-test it',
        'Rate this result and tell me what to improve before I publish it',
      );
    }

    if (
      uiActionTypes.has('analytics_snapshot_card') ||
      hasCompletedTool(
        AgentToolName.GET_ANALYTICS,
        AgentToolName.ANALYZE_PERFORMANCE,
        'get_top_ingredients',
        'rate_content',
      )
    ) {
      // Short chip labels; full prompt is what gets sent on click (PostHog-style).
      addSuggestion(
        'analytics-repeat',
        'Find repeatable winners',
        'Show me the strongest patterns from this analytics summary and what I should deliberately repeat next week.',
      );
      addSuggestion(
        'analytics-remix',
        'Create a remix',
        'Take the best-performing item from this analysis and draft a fresh remix I can publish next.',
      );
      addSuggestion(
        'analytics-schedule',
        'Plan the next batch',
        'Plan my next content batch around the winners from this analysis, with formats and timing.',
      );
    }

    if (
      uiActionTypes.has('publish_post_card') ||
      uiActionTypes.has('schedule_post_card') ||
      uiActionTypes.has('content_calendar_card') ||
      hasCompletedTool(AgentToolName.CREATE_POST, AgentToolName.SCHEDULE_POST)
    ) {
      addSuggestion(
        'publish-followup',
        'Create follow-ups',
        'Create two follow-up posts that build on this result',
      );
      addSuggestion(
        'publish-calendar',
        'Map the next slot',
        'Find the best next slot in my calendar for related content',
      );
      addSuggestion(
        'publish-variants',
        'Cross-post versions',
        'Adapt this into versions for my other active channels',
      );
    }

    if (
      uiActionTypes.has('review_gate_card') ||
      hasCompletedTool(
        AgentToolName.LIST_REVIEW_QUEUE,
        AgentToolName.BATCH_APPROVE_REJECT,
        AgentToolName.GET_APPROVAL_SUMMARY,
      )
    ) {
      addSuggestion(
        'review-ready',
        'Approve the ready ones',
        'Show me the items that are safe to approve right now',
      );
      addSuggestion(
        'review-fix',
        'Fix the weak spots',
        'Take the weakest review items and rewrite them so they are ready to publish',
      );
      addSuggestion(
        'review-schedule',
        'Queue approved content',
        'Schedule the approved content into the best available slots',
      );
    }

    if (
      uiActionTypes.has('trending_topics_card') ||
      hasCompletedTool(
        AgentToolName.GET_TRENDS,
        'list_ads_research',
        'get_ad_research_detail',
      )
    ) {
      addSuggestion(
        'trends-batch',
        'Turn this into content',
        'Turn these trends into a batch of content ideas I can ship this week',
      );
      addSuggestion(
        'trends-angle',
        'Pick the best angle',
        'Tell me which trend has the best upside for my brand and why',
      );
      addSuggestion(
        'trends-automation',
        'Automate this loop',
        'Create an automation that checks this trend pattern and drafts follow-up content',
      );
    }

    return suggestions;
  }
}
