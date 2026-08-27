import { IngredientPickerCard } from '@genfeedai/agent/components/IngredientPickerCard';
import { ReviewGateCard } from '@genfeedai/agent/components/ReviewGateCard';
import { SchedulePostCard } from '@genfeedai/agent/components/SchedulePostCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/data/content/use-posting-sets/use-posting-sets', () => ({
  usePostingSets: () => ({
    createSet: vi.fn(),
    expandError: null,
    expandSet: vi.fn(),
    isExpanding: false,
    isLoading: false,
    isSaving: false,
    saveError: null,
    sets: [],
  }),
}));

vi.mock(
  '@hooks/data/content/use-posting-signatures/use-posting-signatures',
  () => ({
    usePostingSignatures: () => ({
      isLoading: false,
      signatures: [],
    }),
  }),
);

function MockPostingSetPicker() {
  return null;
}

vi.mock('@ui/publisher/PostingSetPicker', () => ({
  default: MockPostingSetPicker,
}));

function MockPostingSignaturePicker() {
  return null;
}

vi.mock('@ui/publisher/PostingSignaturePicker', () => ({
  default: MockPostingSignaturePicker,
}));

describe('ReviewGateCard', () => {
  function makeAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
    return {
      description: 'Approve or reject the drafts below.',
      id: 'review-1',
      items: [
        { id: 'item-1', platform: 'instagram', title: 'Post A', type: 'post' },
        { id: 'item-2', title: 'Post B' },
      ],
      title: 'Review drafts',
      type: 'review_gate_card',
      ...overrides,
    } as AgentUiAction;
  }

  it('renders items and disables actions until a selection is made', () => {
    render(<ReviewGateCard action={makeAction()} />);

    expect(screen.getByText('Review drafts')).toBeInTheDocument();
    expect(screen.getByText('Post A')).toBeInTheDocument();
    expect(screen.getByText('post · instagram')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /approve \(0\)/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /reject \(0\)/i }),
    ).toBeDisabled();
  });

  it('approves the selected items', () => {
    const onApprove = vi.fn();
    render(<ReviewGateCard action={makeAction()} onApprove={onApprove} />);

    fireEvent.click(screen.getAllByRole('checkbox')[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /approve \(1\)/i }));

    expect(onApprove).toHaveBeenCalledWith(['item-1']);
    expect(
      screen.getByText(/review submitted for 1 item/i),
    ).toBeInTheDocument();
  });

  it('select-all then reject submits every item id', () => {
    const onReject = vi.fn();
    render(<ReviewGateCard action={makeAction()} onReject={onReject} />);

    fireEvent.click(screen.getByRole('button', { name: /select all/i }));
    fireEvent.click(screen.getByRole('button', { name: /reject \(2\)/i }));

    expect(onReject).toHaveBeenCalledWith(['item-1', 'item-2']);
    expect(
      screen.getByText(/review submitted for 2 items/i),
    ).toBeInTheDocument();
  });

  it('toggling a selected item removes it again', () => {
    render(<ReviewGateCard action={makeAction()} />);

    const checkbox = screen.getAllByRole('checkbox')[0] as HTMLElement;
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);

    expect(
      screen.getByRole('button', { name: /approve \(0\)/i }),
    ).toBeDisabled();
  });

  it('shows an empty state without items', () => {
    render(<ReviewGateCard action={makeAction({ items: [] })} />);

    expect(screen.getByText('No items to review')).toBeInTheDocument();
  });
});

describe('SchedulePostCard', () => {
  function makeAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
    return {
      creditEstimate: 12,
      description: 'Pick a time',
      id: 'schedule-1',
      platforms: ['instagram'],
      scheduledAt: '2026-04-01T10:00',
      title: 'Schedule launch post',
      type: 'schedule_post_card',
      ...overrides,
    } as AgentUiAction;
  }

  it('renders suggested values and schedules with them', () => {
    const onSchedule = vi.fn();
    render(<SchedulePostCard action={makeAction()} onSchedule={onSchedule} />);

    expect(screen.getByText('Schedule launch post')).toBeInTheDocument();
    expect(screen.getByText(/estimated cost: 12 credits/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Schedule timezone')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /schedule/i }));

    expect(onSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['instagram'],
        timezone: expect.any(String),
      }),
    );
    expect(onSchedule.mock.calls[0]?.[0].scheduledAt).toEqual(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
    expect(screen.getByText('Schedule launch post')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /schedule/i }),
    ).not.toBeInTheDocument();
  });

  it('toggles platforms before scheduling', () => {
    const onSchedule = vi.fn();
    render(
      <SchedulePostCard
        action={makeAction({ platforms: ['instagram', 'twitter'] })}
        onSchedule={onSchedule}
      />,
    );

    fireEvent.click(screen.getByLabelText(/instagram/i));
    fireEvent.click(screen.getByRole('button', { name: /schedule/i }));

    expect(onSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['twitter'],
      }),
    );
  });

  it('disables scheduling without a date or platforms', () => {
    render(
      <SchedulePostCard
        action={makeAction({
          platforms: ['linkedin'],
          scheduledAt: undefined,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /schedule/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/date & time/i), {
      target: { value: '2026-04-02T09:00' },
    });
    expect(screen.getByRole('button', { name: /schedule/i })).toBeEnabled();
  });
});

describe('IngredientPickerCard', () => {
  function makeAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
    return {
      description: 'Pick a base image',
      id: 'picker-1',
      ingredients: [
        {
          id: 'ing-1',
          thumbnailUrl: 'https://cdn.test/a-thumb.png',
          title: 'Sunset',
          type: 'image',
          url: 'https://cdn.test/a.png',
        },
        {
          id: 'ing-2',
          title: 'Waves',
          type: 'video',
          url: 'https://cdn.test/b.mp4',
        },
      ],
      title: 'Choose an ingredient',
      type: 'ingredient_picker_card',
      ...overrides,
    } as AgentUiAction;
  }

  it('renders the grid with image and video thumbnails', () => {
    render(<IngredientPickerCard action={makeAction()} />);

    expect(screen.getByText('Choose an ingredient')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sunset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waves' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /use this ingredient/i }),
    ).not.toBeInTheDocument();
  });

  it('selects, confirms, and can change the selection', () => {
    const onSelect = vi.fn();
    render(<IngredientPickerCard action={makeAction()} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sunset' }));
    fireEvent.click(
      screen.getByRole('button', { name: /use this ingredient/i }),
    );

    expect(onSelect).toHaveBeenCalledWith({ id: 'ing-1', title: 'Sunset' });
    expect(screen.getByText('Sunset')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    expect(screen.getByRole('button', { name: 'Sunset' })).toBeInTheDocument();
  });

  it('renders an empty state without ingredients', () => {
    render(<IngredientPickerCard action={makeAction({ ingredients: [] })} />);

    expect(screen.getByText('No ingredients available')).toBeInTheDocument();
  });
});
