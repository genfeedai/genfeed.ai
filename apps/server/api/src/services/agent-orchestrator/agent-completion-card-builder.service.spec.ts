import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentToolName, type AgentUiAction } from '@genfeedai/interfaces';

describe('AgentCompletionCardBuilderService', () => {
  const service = new AgentCompletionCardBuilderService();

  it('builds a workflow completion card with the existing CTA and suggestion priority', () => {
    const workflowAction: AgentUiAction = {
      ctas: [
        { href: '/automations/editor/workflow-1', label: 'Open workflow' },
      ],
      id: 'workflow-created-1',
      scheduleSummary: 'Every weekday at 17:00',
      title: 'Automation installed',
      type: 'workflow_created_card',
      workflowId: 'workflow-1',
      workflowName: 'LinkedIn launch',
    };

    const result = service.buildAssistantUiActions({
      reviewRequired: false,
      toolCalls: [
        { status: 'completed', toolName: AgentToolName.CREATE_WORKFLOW },
      ],
      uiActions: [workflowAction],
    });

    expect(result.suggestedActions).toEqual([
      {
        id: 'workflow-tune',
        label: 'Tune this workflow',
        prompt:
          'Show me how to customize this automation for my brand and goals',
      },
      {
        id: 'workflow-channel',
        label: 'Add another channel',
        prompt:
          'Create a second automation for another channel using this workflow as the base',
      },
      {
        id: 'workflow-schedule',
        label: 'Review schedule',
        prompt:
          'Review the schedule for this automation and suggest the best posting windows',
      },
    ]);
    expect(result.uiActions).toEqual([
      {
        id: 'completion-summary-workflow-created-1',
        outcomeBullets: [
          'Automation ready to edit and run',
          'Workflow: LinkedIn launch',
          'Every weekday at 17:00',
        ],
        primaryCta: {
          href: '/automations/editor/workflow-1',
          label: 'Use in Workflow',
        },
        secondaryCtas: [
          {
            action: 'send_prompt',
            label: 'Tune this workflow',
            payload: {
              prompt:
                'Show me how to customize this automation for my brand and goals',
            },
          },
          {
            action: 'send_prompt',
            label: 'Add another channel',
            payload: {
              prompt:
                'Create a second automation for another channel using this workflow as the base',
            },
          },
          {
            action: 'send_prompt',
            label: 'Review schedule',
            payload: {
              prompt:
                'Review the schedule for this automation and suggest the best posting windows',
            },
          },
        ],
        status: 'completed',
        summaryText: 'Created a recurring automation for this request.',
        title: 'Done',
        type: 'completion_summary_card',
      },
      workflowAction,
    ]);
  });

  it('preserves content counts, output order, the four-variant cap, and the review CTA label', () => {
    const contentAction: AgentUiAction = {
      audio: ['https://cdn.example.com/audio.mp3'],
      ctas: [{ href: '/posts/drafts', label: 'View all drafts' }],
      id: 'content-preview-1',
      images: [
        'https://cdn.example.com/image-1.png',
        'https://cdn.example.com/image-2.png',
      ],
      ingredients: [
        {
          id: 'ingredient-1',
          title: 'Ingredient image',
          type: 'image',
          url: 'https://cdn.example.com/ingredient.png',
        },
      ],
      textContent: 'Long-form caption',
      title: 'Generated drafts',
      tweets: ['Hook one', 'Hook two'],
      type: 'content_preview_card',
      videos: ['https://cdn.example.com/video.mp4'],
    };

    const result = service.buildAssistantUiActions({
      reviewRequired: false,
      toolCalls: [
        { status: 'completed', toolName: AgentToolName.GENERATE_CONTENT },
      ],
      uiActions: [contentAction],
    });

    expect(result.uiActions[0]).toEqual(
      expect.objectContaining({
        outcomeBullets: [
          '3 text variants',
          '3 image assets',
          '1 video asset',
          '1 audio asset',
        ],
        outputVariants: [
          {
            id: 'content-preview-1:image:0',
            kind: 'image',
            title: 'Generated drafts',
            url: 'https://cdn.example.com/image-1.png',
          },
          {
            id: 'content-preview-1:image:1',
            kind: 'image',
            title: 'Generated drafts',
            url: 'https://cdn.example.com/image-2.png',
          },
          {
            id: 'content-preview-1:video:0',
            kind: 'video',
            title: 'Generated drafts',
            url: 'https://cdn.example.com/video.mp4',
          },
          {
            id: 'content-preview-1:audio:0',
            kind: 'audio',
            title: 'Generated drafts',
            url: 'https://cdn.example.com/audio.mp3',
          },
        ],
        primaryCta: {
          href: '/posts/drafts',
          label: 'Review Draft',
        },
        summaryText: 'Generated content for this request.',
        type: 'completion_summary_card',
      }),
    );
  });

  it('uses the ready-for-review fallback when a content action has no assets', () => {
    const result = service.buildAssistantUiActions({
      reviewRequired: false,
      toolCalls: [],
      uiActions: [
        {
          id: 'empty-content-preview',
          title: 'Draft',
          type: 'content_preview_card',
        },
      ],
    });

    expect(result.uiActions[0]).toMatchObject({
      outcomeBullets: ['Ready for review'],
      outputVariants: [],
      type: 'completion_summary_card',
    });
  });

  it('builds the generic completed-tool card and formats tool names', () => {
    const result = service.buildAssistantUiActions({
      reviewRequired: false,
      toolCalls: [
        { status: 'completed', toolName: AgentToolName.CREATE_POST },
        { status: 'failed', toolName: AgentToolName.SCHEDULE_POST },
      ],
      uiActions: [],
    });

    expect(result.uiActions).toEqual([
      {
        id: `completion-summary-tools-${AgentToolName.CREATE_POST}`,
        outcomeBullets: ['1 tool action completed', 'Tool: Create Post'],
        secondaryCtas: [
          {
            action: 'send_prompt',
            label: 'Create follow-ups',
            payload: {
              prompt: 'Create two follow-up posts that build on this result',
            },
          },
          {
            action: 'send_prompt',
            label: 'Map the next slot',
            payload: {
              prompt:
                'Find the best next slot in my calendar for related content',
            },
          },
          {
            action: 'send_prompt',
            label: 'Cross-post versions',
            payload: {
              prompt: 'Adapt this into versions for my other active channels',
            },
          },
        ],
        status: 'completed',
        summaryText: 'Completed this request successfully.',
        title: 'Done',
        type: 'completion_summary_card',
      },
    ]);
  });

  it('does not add a generic card for failed tools or when another UI action exists', () => {
    const existingAction: AgentUiAction = {
      id: 'credits-1',
      title: 'Credits',
      type: 'credits_balance_card',
    };

    expect(
      service.buildAssistantUiActions({
        reviewRequired: false,
        toolCalls: [{ status: 'failed', toolName: AgentToolName.CREATE_POST }],
        uiActions: [],
      }).uiActions,
    ).toEqual([]);
    expect(
      service.buildAssistantUiActions({
        reviewRequired: false,
        toolCalls: [
          { status: 'completed', toolName: AgentToolName.GET_CREDITS_BALANCE },
        ],
        uiActions: [existingAction],
      }).uiActions,
    ).toEqual([existingAction]);
  });

  it('suppresses suggestions during review without suppressing the completion card', () => {
    const result = service.buildAssistantUiActions({
      reviewRequired: true,
      toolCalls: [
        { status: 'completed', toolName: AgentToolName.GENERATE_IMAGE },
      ],
      uiActions: [
        {
          id: 'content-preview-1',
          images: ['https://cdn.example.com/image.png'],
          title: 'Preview',
          type: 'content_preview_card',
        },
      ],
    });

    expect(result.suggestedActions).toEqual([]);
    expect(result.uiActions[0]).toMatchObject({
      secondaryCtas: [],
      type: 'completion_summary_card',
    });
  });

  it('keeps workflow suggestions ahead of later matching domains and caps them at three', () => {
    const result = service.buildAssistantUiActions({
      reviewRequired: false,
      toolCalls: [
        { status: 'completed', toolName: AgentToolName.CREATE_WORKFLOW },
        { status: 'completed', toolName: AgentToolName.GENERATE_IMAGE },
        { status: 'completed', toolName: AgentToolName.GET_ANALYTICS },
      ],
      uiActions: [],
    });

    expect(result.suggestedActions.map((suggestion) => suggestion.id)).toEqual([
      'workflow-tune',
      'workflow-channel',
      'workflow-schedule',
    ]);
  });

  it.each([
    {
      expectedId: 'analytics-repeat',
      toolName: AgentToolName.GET_ANALYTICS,
    },
    {
      expectedId: 'publish-followup',
      toolName: AgentToolName.CREATE_POST,
    },
    {
      expectedId: 'review-ready',
      toolName: AgentToolName.LIST_REVIEW_QUEUE,
    },
    {
      expectedId: 'trends-batch',
      toolName: AgentToolName.GET_TRENDS,
    },
  ])('preserves $expectedId as the first suggestion for $toolName', ({
    expectedId,
    toolName,
  }) => {
    const result = service.buildAssistantUiActions({
      reviewRequired: false,
      toolCalls: [{ status: 'completed', toolName }],
      uiActions: [],
    });

    expect(result.suggestedActions[0]?.id).toBe(expectedId);
  });
});
