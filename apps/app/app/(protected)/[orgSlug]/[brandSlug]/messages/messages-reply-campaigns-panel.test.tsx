import type { SocialReplyCampaign } from '@genfeedai/interfaces';
import { SocialReplyCampaignModel } from '@genfeedai/models/social/social-reply-campaign.model';
import type { ReplyCampaignsPanelProps } from '@genfeedai/props/social/reply-campaigns-panel.props';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import MessagesReplyCampaignsPanel from './messages-reply-campaigns-panel';

vi.mock('@ui/primitives/badge', () => ({
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    icon,
    isDisabled,
    onClick,
  }: {
    children?: ReactNode;
    icon?: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={isDisabled} onClick={onClick} type="button">
      {icon}
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    label,
    onChange,
    value,
  }: {
    label?: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    value: string;
  }) => (
    <label>
      {label}
      <input onChange={onChange} value={value} />
    </label>
  ),
}));

vi.mock('@ui/primitives/progress', () => ({
  Progress: ({ value }: { value?: number }) => (
    <div data-testid="progress" data-value={value} />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

vi.mock('@ui/primitives/sheet', () => ({
  Sheet: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SheetDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: ({
    onChange,
    placeholder,
    value,
  }: {
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    value: string;
  }) => (
    <textarea onChange={onChange} placeholder={placeholder} value={value} />
  ),
}));

function buildCampaign(
  overrides: Partial<SocialReplyCampaign> = {},
): SocialReplyCampaignModel {
  return new SocialReplyCampaignModel({
    bodyTemplate: 'Thanks for watching',
    createdAt: '2026-07-30T08:00:00.000Z',
    failedCount: 1,
    id: 'campaign-1',
    maxPerDay: 50,
    maxPerHour: 10,
    messageType: 'reply',
    minDelaySeconds: 60,
    name: 'Launch follow-up',
    platform: 'youtube',
    sentCount: 3,
    skippedCount: 1,
    status: 'running',
    totalRecipients: 10,
    updatedAt: '2026-07-30T08:00:00.000Z',
    ...overrides,
  });
}

function renderPanel(overrides: Partial<ReplyCampaignsPanelProps> = {}) {
  const props = {
    busyCampaignId: null,
    campaigns: [buildCampaign()],
    enrollableConversations: [
      { id: 'conversation-1', platform: 'youtube' as const },
      { id: 'conversation-2', platform: 'youtube' as const },
      { id: 'conversation-3', platform: 'instagram' as const },
    ],
    error: null,
    isCreating: false,
    isLoading: false,
    isOpen: true,
    onCreate: vi.fn(),
    onOpenChange: vi.fn(),
    onRefresh: vi.fn(),
    onTransition: vi.fn(),
    ...overrides,
  };

  render(<MessagesReplyCampaignsPanel {...props} />);
  return props;
}

describe('MessagesReplyCampaignsPanel', () => {
  it('reports pacing and terminal counts, not just the successful sends', () => {
    renderPanel();

    expect(screen.getByTestId('progress')).toHaveAttribute('data-value', '50');
    expect(
      screen.getByText('3/10 sent · 1 skipped · 1 failed'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('≤10/hr · ≤50/day · 60s apart'),
    ).toBeInTheDocument();
  });

  it('offers only the transitions the current status accepts', () => {
    renderPanel({
      campaigns: [
        buildCampaign(),
        buildCampaign({ id: 'campaign-2', status: 'draft' }),
        buildCampaign({ id: 'campaign-3', status: 'completed' }),
      ],
    });

    const running = screen.getByTestId('reply-campaign-campaign-1');
    const draft = screen.getByTestId('reply-campaign-campaign-2');
    const completed = screen.getByTestId('reply-campaign-campaign-3');

    expect(running).toHaveTextContent('Pause');
    expect(running).toHaveTextContent('Cancel');
    expect(running).not.toHaveTextContent('Start');
    expect(draft).toHaveTextContent('Start');
    expect(completed).not.toHaveTextContent('Cancel');
  });

  it('sends the requested transition for the campaign that owns the button', () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(props.onTransition).toHaveBeenCalledWith('campaign-1', 'pause');
  });

  // The API rejects an enrollment that mixes platforms, so the roster has to be
  // narrowed before the request goes out — not after it comes back 400.
  it('enrols only the conversations on the campaign platform', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    renderPanel({ campaigns: [], onCreate });

    expect(screen.getByTestId('reply-campaign-roster')).toHaveTextContent(
      '2 conversations from the current filters',
    );

    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Launch follow-up' },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        'Thanks for watching — here is the link you asked for.',
      ),
      { target: { value: 'Hey, thanks for the comment' } },
    );
    fireEvent.change(screen.getByLabelText('Per hour'), {
      target: { value: '4' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        bodyTemplate: 'Hey, thanks for the comment',
        conversationIds: ['conversation-1', 'conversation-2'],
        maxPerDay: 50,
        maxPerHour: 4,
        messageType: 'reply',
        minDelaySeconds: 60,
        name: 'Launch follow-up',
        platform: 'youtube',
      });
    });
  });

  it('refuses to create a campaign with nothing to enrol', () => {
    const onCreate = vi.fn();
    renderPanel({ campaigns: [], enrollableConversations: [], onCreate });

    fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }));

    expect(onCreate).not.toHaveBeenCalled();
  });

  it('surfaces a failure instead of leaving the panel silent', () => {
    renderPanel({ error: 'Campaign could not be paused.' });

    expect(screen.getByTestId('reply-campaigns-error')).toHaveTextContent(
      'Campaign could not be paused.',
    );
  });
});
