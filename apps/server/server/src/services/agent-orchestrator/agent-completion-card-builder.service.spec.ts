import { AgentToolName, type AgentUiAction } from '@genfeedai/interfaces';
import { AgentCompletionCardBuilderService } from '@server/services/agent-orchestrator/agent-completion-card-builder.service';

describe('AgentCompletionCardBuilderService', () => {
  const service = new AgentCompletionCardBuilderService();

  it('builds a workflow completion card with the existing CTA and suggestion priority', () => {
    const workflowAction: AgentUiAction = {
      ctas: [
        { href: '/automation/workflows/workflow-1', label: 'Open workflow' },
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
          href: '/automation/workflows/workflow-1',
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

  it('does not mint Done or relabel Confirm install as Use in Workflow', () => {
    const confirmationAction: AgentUiAction = {
      ctas: [
        {
          action: 'confirm_install_official_workflow',
          label: 'Confirm install',
          payload: { sourceId: 'weekly-brand-content' },
        },
      ],
      id: 'workflow-bootstrap-preview-1',
      title: 'Install official workflow?',
      type: 'workflow_created_card',
      workflowName: 'Weekly Brand AI Content Loop',
    };

    const result = service.buildAssistantUiActions({
      reviewRequired: true,
      toolCalls: [
        {
          status: 'completed',
          toolName: AgentToolName.INSTALL_OFFICIAL_WORKFLOW,
        },
      ],
      uiActions: [confirmationAction],
    });

    expect(result.uiActions).toEqual([confirmationAction]);
    expect(
      result.uiActions.some(
        (action) => action.type === 'completion_summary_card',
      ),
    ).toBe(false);
    expect(result.uiActions[0]?.ctas?.[0]).toMatchObject({
      action: 'confirm_install_official_workflow',
      label: 'Confirm install',
    });
  });

  it('keeps the concrete content preview as the only result surface', () => {
    const contentAction: AgentUiAction = {
      audio: ['https://cdn.example.com/audio.mp3'],
      ctas: [
        {
          href: '/publishing/posts?publicationState=not-posted',
          label: 'View all drafts',
        },
      ],
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

    expect(result.uiActions).toEqual([contentAction]);
  });

  it('keeps a thread preview as the only result surface', () => {
    const threadPreview: AgentUiAction = {
      contentFormat: 'thread',
      id: 'thread-preview-1',
      textContent: 'Hook',
      title: 'Launch thread',
      tweets: ['Hook', 'Proof', 'Close'],
      type: 'content_preview_card',
    };
    const result = service.buildAssistantUiActions({
      reviewRequired: false,
      toolCalls: [
        { status: 'completed', toolName: AgentToolName.GENERATE_CONTENT },
      ],
      uiActions: [threadPreview],
    });

    expect(result.uiActions).toEqual([threadPreview]);
  });

  it('does not mint Done for an empty content preview card', () => {
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

    expect(result.uiActions).toEqual([
      {
        id: 'empty-content-preview',
        title: 'Draft',
        type: 'content_preview_card',
      },
    ]);
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

  it('does not mint Done for context-only tools (clarify turns)', () => {
    expect(
      service.buildAssistantUiActions({
        reviewRequired: false,
        toolCalls: [
          { status: 'completed', toolName: AgentToolName.GET_CURRENT_BRAND },
        ],
        uiActions: [],
      }).uiActions,
    ).toEqual([]);

    expect(
      service.buildAssistantUiActions({
        reviewRequired: false,
        toolCalls: [
          { status: 'completed', toolName: AgentToolName.GET_CURRENT_BRAND },
          { status: 'completed', toolName: AgentToolName.LIST_BRANDS },
          {
            status: 'completed',
            toolName: AgentToolName.GET_CONNECTION_STATUS,
          },
        ],
        uiActions: [],
      }).uiActions,
    ).toEqual([]);
  });

  it('still mints Done when a productive tool runs alongside context tools', () => {
    const result = service.buildAssistantUiActions({
      reviewRequired: false,
      toolCalls: [
        { status: 'completed', toolName: AgentToolName.GET_CURRENT_BRAND },
        { status: 'completed', toolName: AgentToolName.CREATE_POST },
      ],
      uiActions: [],
    });

    expect(result.uiActions[0]).toMatchObject({
      id: `completion-summary-tools-${AgentToolName.CREATE_POST}`,
      summaryText: 'Completed this request successfully.',
      type: 'completion_summary_card',
    });
    expect(result.uiActions[0]?.outcomeBullets).toEqual([
      '1 tool action completed',
      'Tool: Create Post',
    ]);
  });

  it('suppresses suggestions during review and keeps one concrete preview', () => {
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
    expect(result.uiActions).toEqual([
      expect.objectContaining({
        id: 'content-preview-1',
        type: 'content_preview_card',
      }),
    ]);
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

  describe('oauth connect card collapse', () => {
    function connectCard(
      platform: string,
      id = `oauth-connect-${platform}`,
    ): AgentUiAction {
      return {
        ctas: [
          { href: `/api/${platform}/connect`, label: `Connect ${platform}` },
        ],
        id,
        platform,
        title: `${platform} not connected`,
        type: 'oauth_connect_card',
      };
    }

    it('collapses one card per connection probe into a single picker', () => {
      const result = service.buildAssistantUiActions({
        reviewRequired: false,
        toolCalls: [
          {
            status: 'completed',
            toolName: AgentToolName.GET_CONNECTION_STATUS,
          },
        ],
        uiActions: [
          connectCard('twitter'),
          connectCard('instagram'),
          connectCard('youtube'),
          connectCard('tiktok'),
          connectCard('linkedin'),
          connectCard('facebook'),
        ],
      });

      const connectCards = result.uiActions.filter(
        (action) => action.type === 'oauth_connect_card',
      );

      expect(connectCards).toHaveLength(1);
      expect(connectCards[0]?.platforms).toEqual([
        'twitter',
        'instagram',
        'youtube',
        'tiktok',
        'linkedin',
        'facebook',
      ]);
      expect(connectCards[0]?.platform).toBeUndefined();
      expect(connectCards[0]?.title).toBe('Connect an account');
    });

    it('keeps only the first card when every card is the platform-less generic picker', () => {
      const genericCard = (id: string): AgentUiAction => ({
        ctas: [{ href: '/api/oauth/connect', label: 'Connect an account' }],
        id,
        title: 'Connect an account',
        type: 'oauth_connect_card',
      });

      const result = service.buildAssistantUiActions({
        reviewRequired: false,
        toolCalls: [
          {
            status: 'completed',
            toolName: AgentToolName.GET_CONNECTION_STATUS,
          },
        ],
        uiActions: [
          genericCard('oauth-generic-1'),
          genericCard('oauth-generic-2'),
          genericCard('oauth-generic-3'),
        ],
      });

      const connectCards = result.uiActions.filter(
        (action) => action.type === 'oauth_connect_card',
      );

      // Persisted turns must match the client collapse: one generic picker,
      // shape untouched, at the position of the first card.
      expect(connectCards).toHaveLength(1);
      expect(connectCards[0]).toEqual(genericCard('oauth-generic-1'));
    });

    it('keeps only the first generic picker while preserving surrounding cards', () => {
      const otherCard: AgentUiAction = {
        id: 'credits-1',
        title: 'Credits',
        type: 'credits_balance_card',
      };

      const result = service.buildAssistantUiActions({
        reviewRequired: false,
        toolCalls: [
          {
            status: 'completed',
            toolName: AgentToolName.GET_CONNECTION_STATUS,
          },
        ],
        uiActions: [
          {
            id: 'oauth-generic-1',
            title: 'Connect an account',
            type: 'oauth_connect_card',
          },
          otherCard,
          {
            id: 'oauth-generic-2',
            title: 'Connect an account',
            type: 'oauth_connect_card',
          },
        ],
      });

      expect(
        result.uiActions.map((action) => `${action.type}:${action.id}`),
      ).toEqual([
        'oauth_connect_card:oauth-generic-1',
        'credits_balance_card:credits-1',
      ]);
    });

    it('leaves a single connect card untouched', () => {
      const result = service.buildAssistantUiActions({
        reviewRequired: false,
        toolCalls: [
          {
            status: 'completed',
            toolName: AgentToolName.GET_CONNECTION_STATUS,
          },
        ],
        uiActions: [connectCard('twitter')],
      });

      const connectCards = result.uiActions.filter(
        (action) => action.type === 'oauth_connect_card',
      );

      expect(connectCards).toHaveLength(1);
      expect(connectCards[0]?.platform).toBe('twitter');
      expect(connectCards[0]?.platforms).toBeUndefined();
    });
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
  ])(
    'preserves $expectedId as the first suggestion for $toolName',
    ({ expectedId, toolName }) => {
      const result = service.buildAssistantUiActions({
        reviewRequired: false,
        toolCalls: [{ status: 'completed', toolName }],
        uiActions: [],
      });

      expect(result.suggestedActions[0]?.id).toBe(expectedId);
    },
  );
});
