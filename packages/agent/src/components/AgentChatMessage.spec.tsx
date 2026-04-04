import { AgentChatMessage } from '@cloud/agent/components/AgentChatMessage';
import type { AgentChatMessage as AgentChatMessageType } from '@cloud/agent/models/agent-chat.model';
import { act, render, screen } from '@testing-library/react';
import { SCROLL_FOCUS_SURFACE_CLASS } from '@ui/styles/scroll-focus';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ui/buttons/base/Button', () => ({
  default: function MockButton(props: {
    ariaLabel?: string;
    children?: ReactNode;
    onClick?: () => void | Promise<void>;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  },
}));

vi.mock('./AiTextActionCard', () => ({
  AiTextActionCard: () => null,
}));
vi.mock('./AdsAgentCards', () => ({
  AdDetailSummaryCard: () => null,
  AdsSearchResultsCard: () => null,
  CampaignLaunchPrepCard: () => null,
}));
vi.mock('./AnalyticsSnapshotCard', () => ({
  AnalyticsSnapshotCard: () => null,
}));
vi.mock('./BatchGenerationCard', () => ({
  BatchGenerationCard: () => null,
}));
vi.mock('./BatchGenerationResultCard', () => ({
  BatchGenerationResultCard: () => (
    <div data-testid="batch-generation-result-card">
      Batch generation result
    </div>
  ),
}));
vi.mock('./BrandCreateCard', () => ({
  BrandCreateCard: () => null,
}));
vi.mock('./CampaignCard', () => ({
  CampaignControlCard: () => null,
  CampaignCreateCard: () => null,
}));
vi.mock('./ClipWorkflowRunCard', () => ({
  ClipWorkflowRunCard: () => null,
}));
vi.mock('./ContentCalendarCard', () => ({
  ContentCalendarCard: () => null,
}));
vi.mock('./CreditsBalanceCard', () => ({
  CreditsBalanceCard: () => null,
}));
vi.mock('./EngagementOpportunityCard', () => ({
  EngagementOpportunityCard: () => null,
}));
vi.mock('./GenerationActionCard', () => ({
  GenerationActionCard: () => null,
}));
vi.mock('./ImageTransformCard', () => ({
  ImageTransformCard: () => null,
}));
vi.mock('./IngredientAlternativesCard', () => ({
  IngredientAlternativesCard: () => null,
}));
vi.mock('./IngredientPickerCard', () => ({
  IngredientPickerCard: () => null,
}));
vi.mock('./OnboardingChecklistCard', () => ({
  OnboardingChecklistCard: () => null,
}));
vi.mock('./PublishPostCard', () => ({
  PublishPostCard: () => null,
}));
vi.mock('./ReviewGateCard', () => ({
  ReviewGateCard: () => null,
}));
vi.mock('./SchedulePostCard', () => ({
  SchedulePostCard: () => null,
}));
vi.mock('./StudioHandoffCard', () => ({
  StudioHandoffCard: () => null,
}));
vi.mock('./TrendingTopicsCard', () => ({
  TrendingTopicsCard: () => null,
}));
vi.mock('./VoiceCloneCard', () => ({
  VoiceCloneCard: () => null,
}));
vi.mock('./WorkflowExecuteCard', () => ({
  WorkflowExecuteCard: () => null,
}));
vi.mock('./WorkflowTriggerCard', () => ({
  WorkflowTriggerCard: () => null,
}));

vi.mock('../stores/agent-chat.store', () => ({
  useAgentChatStore: (
    selector: (state: { modelCosts: Record<string, number> }) => unknown,
  ) =>
    selector({
      modelCosts: {
        'deepseek/deepseek-chat': 1,
      },
    }),
}));

function buildMessage(
  role: AgentChatMessageType['role'],
  content: string,
): AgentChatMessageType {
  return {
    content,
    createdAt: '2026-03-06T14:00:00.000Z',
    id: `${role}-msg`,
    role,
    threadId: 'conv-1',
  };
}

const ONE_PIXEL_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+X2VINwAAAABJRU5ErkJggg==';

describe('AgentChatMessage', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not truncate long assistant content', () => {
    const longAssistantContent = `${'A'.repeat(700)} tail-marker-assistant`;

    render(
      <AgentChatMessage
        message={buildMessage('assistant', longAssistantContent)}
      />,
    );

    expect(screen.queryByText('Show more')).toBeNull();
    expect(screen.getByText(/tail-marker-assistant/)).toBeTruthy();
  });

  it('keeps truncation behavior for long user content', () => {
    const longUserContent = `${'B'.repeat(700)} tail-marker-user`;

    render(
      <AgentChatMessage message={buildMessage('user', longUserContent)} />,
    );

    expect(screen.getByText('Show more')).toBeTruthy();
  });

  it('does not render model controls in assistant runtime UI', () => {
    render(
      <AgentChatMessage
        message={{
          ...buildMessage('assistant', 'Model metadata response'),
          metadata: {
            model: 'deepseek/deepseek-chat',
          },
        }}
      />,
    );

    expect(screen.queryByText('Use model')).toBeNull();
    expect(screen.queryByText('DeepSeek')).toBeNull();
    expect(screen.queryByText('1cr')).toBeNull();
  });

  it('reveals recent assistant content progressively', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T14:00:05.000Z'));

    render(
      <AgentChatMessage
        message={{
          ...buildMessage('assistant', 'Animated recent answer'),
          createdAt: '2026-03-06T14:00:00.000Z',
        }}
      />,
    );

    expect(screen.queryByText('Animated recent answer')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(260);
    });

    expect(screen.getByText('Animated recent answer')).toBeTruthy();
  });

  it('renders assistant messages as inline content instead of bubbles', () => {
    const { container } = render(
      <AgentChatMessage
        message={buildMessage('assistant', 'Inline assistant')}
      />,
    );

    const surface = container.querySelector(
      '[data-message-role="assistant"][data-message-surface="inline"]',
    );

    expect(surface).toBeTruthy();
  });

  it('keeps user messages in bubbles', () => {
    const { container } = render(
      <AgentChatMessage message={buildMessage('user', 'User bubble')} />,
    );

    const surface = container.querySelector(
      '[data-message-role="user"][data-message-surface="bubble"]',
    );

    expect(surface).toBeTruthy();
  });

  it('renders publish success CTA links from content preview cards', () => {
    render(
      <AgentChatMessage
        message={{
          ...buildMessage('assistant', 'Posts queued for publishing.'),
          metadata: {
            uiActions: [
              {
                ctas: [
                  { href: '/posts', label: 'Open posts' },
                  {
                    href: '/analytics/posts?postId=post-1',
                    label: 'Open analytics',
                  },
                ],
                id: 'content-preview-1',
                title: 'Posts queued',
                type: 'content_preview_card',
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Open posts' })).toHaveAttribute(
      'href',
      '/posts',
    );
    expect(
      screen.getByRole('link', { name: 'Open analytics' }),
    ).toHaveAttribute('href', '/analytics/posts?postId=post-1');
  });

  it('renders batch generation result cards inline with assistant messages', () => {
    render(
      <AgentChatMessage
        message={{
          ...buildMessage('assistant', 'Your batch is in progress.'),
          metadata: {
            uiActions: [
              {
                batchCount: 20,
                creditsUsed: 5,
                id: 'batch-result-1',
                platforms: ['instagram', 'twitter'],
                status: 'processing',
                title: 'Batch generation started',
                type: 'batch_generation_result_card',
              },
            ],
          },
        }}
      />,
    );

    expect(
      screen.getByTestId('batch-generation-result-card'),
    ).toBeInTheDocument();
  });

  it('renders generated images from content preview cards', () => {
    render(
      <AgentChatMessage
        message={{
          ...buildMessage('assistant', 'Here is your image.'),
          metadata: {
            uiActions: [
              {
                id: 'content-preview-image',
                images: [ONE_PIXEL_IMAGE],
                title: 'Generated image',
                type: 'content_preview_card',
              },
            ],
          },
        }}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Generated content 1' }),
    ).toHaveAttribute('src', ONE_PIXEL_IMAGE);
  });

  it('renders a completion summary card with quick actions and inline outputs', () => {
    const onRetry = vi.fn();

    render(
      <AgentChatMessage
        message={{
          ...buildMessage('assistant', ''),
          metadata: {
            isFallbackContent: true,
            uiActions: [
              {
                id: 'completion-card-1',
                outcomeBullets: [
                  '3 ad variations',
                  'CTA optimized for conversion',
                  'Ready for review',
                ],
                outputVariants: [
                  {
                    id: 'output-image-1',
                    kind: 'image',
                    title: 'Variant 1',
                    url: ONE_PIXEL_IMAGE,
                  },
                ],
                primaryCta: {
                  href: '/posts/drafts',
                  label: 'Review Draft',
                },
                secondaryCtas: [
                  {
                    action: 'send_prompt',
                    label: 'Edit',
                    payload: { prompt: 'Edit this result for a colder tone' },
                  },
                  {
                    action: 'send_prompt',
                    label: 'Create Variant',
                    payload: { prompt: 'Create three stronger variants' },
                  },
                ],
                status: 'completed',
                summaryText:
                  'Generated 3 LinkedIn caption variants for this topic.',
                title: 'Done',
                type: 'completion_summary_card',
              } as never,
            ],
          },
        }}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(
      screen.getByText('Generated 3 LinkedIn caption variants for this topic.'),
    ).toBeInTheDocument();
    expect(screen.getByText('3 ad variations')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review Draft' })).toHaveAttribute(
      'href',
      '/posts/drafts',
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Variant' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Variant 1' })).toHaveAttribute(
      'src',
      ONE_PIXEL_IMAGE,
    );
    expect(
      screen.queryByText('Results are ready below.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy result summary' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry result' }),
    ).toBeInTheDocument();
  });

  it('renders a simplified completion summary card without inline outputs', () => {
    render(
      <AgentChatMessage
        message={{
          ...buildMessage('assistant', ''),
          metadata: {
            isFallbackContent: true,
            uiActions: [
              {
                id: 'completion-card-2',
                outcomeBullets: ['Workflow scheduled for weekdays at 5pm'],
                primaryCta: {
                  href: '/automations/editor/workflow-1',
                  label: 'Use in Workflow',
                },
                status: 'completed',
                summaryText:
                  'Created a recurring automation for your Instagram batch.',
                title: 'Done',
                type: 'completion_summary_card',
              } as never,
            ],
          },
        }}
      />,
    );

    expect(
      screen.getByText(
        'Created a recurring automation for your Instagram batch.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Use in Workflow' }),
    ).toHaveAttribute('href', '/automations/editor/workflow-1');
    expect(screen.queryByRole('img', { name: /Variant/i })).toBeNull();
  });

  it('collapses missing oauth platforms into one generic integrations card', () => {
    render(
      <AgentChatMessage
        message={{
          ...buildMessage('assistant', 'Connect your accounts.'),
          metadata: {
            uiActions: [
              {
                ctas: [
                  {
                    href: '/settings/organization/credentials?returnTo=/chat',
                    label: 'Open integrations',
                  },
                ],
                id: 'oauth-connect-a',
                title: 'Choose an integration',
                type: 'oauth_connect_card',
              },
              {
                ctas: [
                  {
                    href: '/settings/organization/credentials?returnTo=/chat',
                    label: 'Open integrations',
                  },
                ],
                id: 'oauth-connect-b',
                title: 'Choose an integration',
                type: 'oauth_connect_card',
              },
              {
                ctas: [
                  {
                    href: '/settings/organization/credentials?returnTo=/chat',
                    label: 'Open integrations',
                  },
                ],
                id: 'oauth-connect-c',
                title: 'Choose an integration',
                type: 'oauth_connect_card',
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getAllByText('Choose an integration')).toHaveLength(1);
    expect(
      screen.getByRole('link', { name: 'Open integrations' }),
    ).toHaveAttribute(
      'href',
      '/settings/organization/credentials?returnTo=/chat',
    );
    expect(screen.queryByText('Unknown')).toBeNull();
  });

  it('applies the shared scroll-focus shadow when highlighted', () => {
    render(
      <AgentChatMessage
        isHighlighted={true}
        message={buildMessage('assistant', 'Focused message')}
      />,
    );

    expect(
      screen.getByText('Focused message').closest('.group')?.className,
    ).toContain(SCROLL_FOCUS_SURFACE_CLASS);
  });
});
