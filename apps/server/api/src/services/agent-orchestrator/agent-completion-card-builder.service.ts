import {
  AgentToolName,
  type AgentUiAction,
  type AgentUiActionCta,
} from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

export interface AgentCompletionSuggestedAction {
  id: string;
  label: string;
  prompt: string;
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

@Injectable()
export class AgentCompletionCardBuilderService {
  buildAssistantUiActions(
    params: BuildAssistantUiActionsParams,
  ): BuildAssistantUiActionsResult {
    const suggestedActions = this.buildCompletionSuggestedActions(params);
    const completionSummaryCard = this.buildCompletionSummaryCard({
      suggestedActions,
      toolCalls: params.toolCalls,
      uiActions: params.uiActions,
    });

    return {
      suggestedActions,
      uiActions: completionSummaryCard
        ? [completionSummaryCard, ...params.uiActions]
        : params.uiActions,
    };
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

  private buildCompletionPrimaryCta(
    label: string,
    cta?: AgentUiActionCta,
  ): AgentUiActionCta | undefined {
    if (!cta) {
      return undefined;
    }

    return {
      ...cta,
      label,
    };
  }

  private buildContentCompletionOutputVariants(
    uiActions: AgentUiAction[],
  ): NonNullable<AgentUiAction['outputVariants']> {
    const variants: NonNullable<AgentUiAction['outputVariants']> = [];

    uiActions.forEach((action) => {
      action.images?.forEach((url, index) => {
        if (!url) {
          return;
        }

        variants.push({
          id: `${action.id}:image:${index}`,
          kind: 'image',
          title: action.title,
          url,
        });
      });

      action.videos?.forEach((url, index) => {
        if (!url) {
          return;
        }

        variants.push({
          id: `${action.id}:video:${index}`,
          kind: 'video',
          title: action.title,
          url,
        });
      });

      action.audio?.forEach((url, index) => {
        if (!url) {
          return;
        }

        variants.push({
          id: `${action.id}:audio:${index}`,
          kind: 'audio',
          title: action.title,
          url,
        });
      });

      action.tweets?.forEach((tweet, index) => {
        if (!tweet.trim()) {
          return;
        }

        variants.push({
          id: `${action.id}:tweet:${index}`,
          kind: 'text',
          textContent: tweet,
          title: `Text ${index + 1}`,
        });
      });

      if (action.textContent?.trim()) {
        variants.push({
          id: `${action.id}:text-content`,
          kind: 'text',
          textContent: action.textContent,
          title: action.title,
        });
      }

      action.ingredients?.forEach((ingredient, index) => {
        if (!ingredient.url) {
          return;
        }

        variants.push({
          id: `${action.id}:ingredient:${index}`,
          kind: ingredient.type === 'video' ? 'video' : 'image',
          thumbnailUrl: ingredient.thumbnailUrl,
          title: ingredient.title ?? action.title,
          url: ingredient.url,
        });
      });
    });

    return variants.slice(0, 4);
  }

  private buildCompletionSummaryCard(
    params: BuildCompletionSummaryCardParams,
  ): AgentUiAction | null {
    const workflowAction = params.uiActions.find(
      (action) => action.type === 'workflow_created_card',
    );

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
          workflowAction.ctas?.[0],
        ) ?? {
          href: workflowAction.workflowId
            ? `/automations/editor/${workflowAction.workflowId}`
            : '/automations/editor/',
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

    const contentActions = params.uiActions.filter(
      (action) =>
        action.type === 'content_preview_card' ||
        action.type === 'batch_generation_card' ||
        action.type === 'batch_generation_result_card' ||
        action.type === 'clip_run_card' ||
        action.type === 'clip_workflow_run_card',
    );

    if (contentActions.length > 0) {
      const textCount = contentActions.reduce(
        (total, action) =>
          total +
          (action.tweets?.length ?? 0) +
          (action.textContent?.trim().length ? 1 : 0),
        0,
      );
      const imageCount = contentActions.reduce(
        (total, action) =>
          total +
          (action.images?.length ?? 0) +
          (action.ingredients?.filter(
            (ingredient) => ingredient.type === 'image',
          ).length ?? 0),
        0,
      );
      const videoCount = contentActions.reduce(
        (total, action) =>
          total +
          (action.videos?.length ?? 0) +
          (action.ingredients?.filter(
            (ingredient) => ingredient.type === 'video',
          ).length ?? 0),
        0,
      );
      const audioCount = contentActions.reduce(
        (total, action) => total + (action.audio?.length ?? 0),
        0,
      );
      const outcomeBullets = [
        textCount > 0
          ? `${textCount} text variant${textCount === 1 ? '' : 's'}`
          : null,
        imageCount > 0
          ? `${imageCount} image asset${imageCount === 1 ? '' : 's'}`
          : null,
        videoCount > 0
          ? `${videoCount} video asset${videoCount === 1 ? '' : 's'}`
          : null,
        audioCount > 0
          ? `${audioCount} audio asset${audioCount === 1 ? '' : 's'}`
          : null,
      ].filter((bullet): bullet is string => Boolean(bullet));

      return {
        id: `completion-summary-${contentActions[0].id}`,
        outcomeBullets:
          outcomeBullets.length > 0 ? outcomeBullets : ['Ready for review'],
        outputVariants:
          this.buildContentCompletionOutputVariants(contentActions),
        primaryCta: this.buildCompletionPrimaryCta(
          'Review Draft',
          contentActions.flatMap((action) => action.ctas ?? [])[0],
        ),
        secondaryCtas: this.buildCompletionSecondaryCtas(
          params.suggestedActions,
        ),
        status: 'completed',
        summaryText: 'Generated content for this request.',
        title: 'Done',
        type: 'completion_summary_card',
      };
    }

    const hasCompletedTool = params.toolCalls.some(
      (toolCall) => toolCall.status === 'completed',
    );

    if (!hasCompletedTool) {
      return null;
    }

    if (params.uiActions.length > 0) {
      return null;
    }

    const completedToolNames = params.toolCalls
      .filter((toolCall) => toolCall.status === 'completed')
      .map((toolCall) => toolCall.toolName)
      .filter((toolName): toolName is string => typeof toolName === 'string');

    const outcomeBullets = [
      `${completedToolNames.length} tool action${completedToolNames.length === 1 ? '' : 's'} completed`,
      ...completedToolNames
        .slice(0, 3)
        .map((toolName) => `Tool: ${this.formatCompletionToolName(toolName)}`),
    ];

    return {
      id: `completion-summary-tools-${completedToolNames[0] ?? 'generic'}`,
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
      addSuggestion(
        'analytics-repeat',
        'Find repeatable winners',
        'Show me the strongest patterns here and what I should repeat next',
      );
      addSuggestion(
        'analytics-remix',
        'Create a remix',
        'Take the best performer and give me a fresh remix to test next',
      );
      addSuggestion(
        'analytics-schedule',
        'Plan the next batch',
        'Plan my next batch around the winners from this analysis',
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
