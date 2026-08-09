import { AiTextActionCard } from '@genfeedai/agent/components/AiTextActionCard';
import { BrandInterviewOfferCard } from '@genfeedai/agent/components/BrandInterviewOfferCard';
import { ContentCalendarCard } from '@genfeedai/agent/components/ContentCalendarCard';
import { EngagementOpportunityCard } from '@genfeedai/agent/components/EngagementOpportunityCard';
import { LivestreamBotCard } from '@genfeedai/agent/components/LivestreamBotCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('AiTextActionCard', () => {
  function makeAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
    return {
      description: 'Improve your copy',
      id: 'text-1',
      textContent: 'Original caption',
      title: 'Polish text',
      type: 'ai_text_action_card',
      ...overrides,
    } as AgentUiAction;
  }

  it('renders default actions and requires a selection to apply', () => {
    render(<AiTextActionCard action={makeAction()} />);

    expect(screen.getByText('Polish text')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rewrite' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('applies the selected action with the text content', () => {
    const onApply = vi.fn();
    render(<AiTextActionCard action={makeAction()} onApply={onApply} />);

    fireEvent.click(screen.getByRole('button', { name: 'Shorten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledWith({
      selectedAction: 'Shorten',
      text: 'Original caption',
    });
    expect(screen.getByText(/"Shorten" applied/)).toBeInTheDocument();
  });

  it('renders custom text actions from the action payload', () => {
    render(
      <AiTextActionCard action={makeAction({ textActions: ['Emojify'] })} />,
    );

    expect(screen.getByRole('button', { name: 'Emojify' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Rewrite' }),
    ).not.toBeInTheDocument();
  });
});

describe('EngagementOpportunityCard', () => {
  function makeAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
    return {
      draftReply: 'Thanks for sharing!',
      id: 'engage-1',
      originalPost: {
        author: '@fan',
        content: 'Love this product',
        platform: 'twitter',
      },
      title: 'Reply opportunity',
      type: 'engagement_opportunity_card',
      ...overrides,
    } as AgentUiAction;
  }

  it('renders the original post and approves the draft reply', () => {
    const onApprove = vi.fn();
    render(
      <EngagementOpportunityCard action={makeAction()} onApprove={onApprove} />,
    );

    expect(screen.getByText('@fan')).toBeInTheDocument();
    expect(screen.getByText('on twitter')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(onApprove).toHaveBeenCalledWith('Thanks for sharing!');
    expect(screen.getByText('Response handled')).toBeInTheDocument();
  });

  it('edits the reply before saving', () => {
    const onEdit = vi.fn();
    render(<EngagementOpportunityCard action={makeAction()} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    fireEvent.change(screen.getByLabelText(/draft reply/i), {
      target: { value: 'Custom reply' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onEdit).toHaveBeenCalledWith('Custom reply');
  });

  it('skip marks the card handled', () => {
    const onSkip = vi.fn();
    render(<EngagementOpportunityCard action={makeAction()} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole('button', { name: /skip/i }));

    expect(onSkip).toHaveBeenCalled();
    expect(screen.getByText('Response handled')).toBeInTheDocument();
  });

  it('disables approve for an empty draft reply', () => {
    render(
      <EngagementOpportunityCard
        action={makeAction({ draftReply: undefined })}
      />,
    );

    expect(screen.getByText('No draft reply provided')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
  });
});

describe('LivestreamBotCard', () => {
  function makeAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
    return {
      botName: 'StreamBot',
      ctas: [
        { href: '/livestreams/session-1', label: 'Open session' },
        { action: 'stop_bot', label: 'Stop bot', payload: { sessionId: 's1' } },
      ],
      description: 'Bot is live',
      id: 'bot-1',
      platform: 'youtube',
      sessionStatus: 'connected',
      title: 'Livestream assistant',
      type: 'livestream_bot_card',
      ...overrides,
    } as AgentUiAction;
  }

  it('renders bot metadata, links, and action buttons', () => {
    render(<LivestreamBotCard action={makeAction()} />);

    expect(screen.getByText('Livestream assistant')).toBeInTheDocument();
    expect(screen.getByText('StreamBot')).toBeInTheDocument();
    expect(screen.getByText('youtube')).toBeInTheDocument();
    expect(screen.getByText('connected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open session/i })).toHaveAttribute(
      'href',
      '/livestreams/session-1',
    );
  });

  it('runs the CTA action and shows Done afterwards', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);
    render(<LivestreamBotCard action={makeAction()} onUiAction={onUiAction} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop bot/i }));
    });

    expect(onUiAction).toHaveBeenCalledWith('stop_bot', { sessionId: 's1' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled(),
    );
  });

  it('ignores clicks without an onUiAction handler', () => {
    render(<LivestreamBotCard action={makeAction()} />);

    fireEvent.click(screen.getByRole('button', { name: /stop bot/i }));

    expect(screen.getByRole('button', { name: /stop bot/i })).toBeEnabled();
  });
});

describe('BrandInterviewOfferCard', () => {
  function makeAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
    return {
      ctas: [{ action: 'start_interview', label: 'Start interview' }],
      data: {
        completenessScore: 42,
        currentQuestion: { questionText: 'What does your brand stand for?' },
      },
      description: 'Answer a few questions',
      id: 'interview-1',
      title: 'Brand interview',
      type: 'brand_interview_offer_card',
      ...overrides,
    } as AgentUiAction;
  }

  it('renders completeness and the first question', () => {
    render(<BrandInterviewOfferCard action={makeAction()} />);

    expect(screen.getByText('Brand interview')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(
      screen.getByText('What does your brand stand for?'),
    ).toBeInTheDocument();
  });

  it('starts the interview through onUiAction', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);
    render(
      <BrandInterviewOfferCard action={makeAction()} onUiAction={onUiAction} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start interview/i }));
    });

    expect(onUiAction).toHaveBeenCalledWith('start_interview', undefined);
    await waitFor(() =>
      expect(screen.getByText('Interview started.')).toBeInTheDocument(),
    );
  });

  it('hides the start button without a start CTA', () => {
    render(<BrandInterviewOfferCard action={makeAction({ ctas: [] })} />);

    expect(
      screen.queryByRole('button', { name: /start interview/i }),
    ).not.toBeInTheDocument();
  });
});

describe('ContentCalendarCard', () => {
  function makeAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
    return {
      calendarDays: [
        { date: '2026-04-06', postCount: 2 },
        { date: '2026-04-07', postCount: 0 },
      ],
      description: 'This week',
      id: 'calendar-1',
      title: 'Content calendar',
      type: 'content_calendar_card',
      ...overrides,
    } as AgentUiAction;
  }

  it('renders filled days with counts and gaps with a fill button', () => {
    const onFillGap = vi.fn();
    render(<ContentCalendarCard action={makeAction()} onFillGap={onFillGap} />);

    expect(screen.getByText('Content calendar')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(onFillGap).toHaveBeenCalledWith('2026-04-07');
  });

  it('renders an empty state without calendar days', () => {
    render(<ContentCalendarCard action={makeAction({ calendarDays: [] })} />);

    expect(screen.getByText('No calendar data available')).toBeInTheDocument();
  });
});
