import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import HighlightReviewCard, { type IHighlight } from './HighlightReviewCard';

const mockHighlight: IHighlight = {
  clip_type: 'hook',
  end_time: 45,
  id: 'test-uuid-1',
  start_time: 15,
  summary: 'This is an amazing opening hook that grabs attention instantly.',
  tags: ['viral', 'trending'],
  title: 'Epic Opening Hook',
  virality_score: 85,
};

describe('HighlightReviewCard', () => {
  it('renders the highlight title, virality score, clip type, and duration', () => {
    render(
      <HighlightReviewCard
        highlight={mockHighlight}
        selected={true}
        onToggle={vi.fn()}
        onTitleEdit={vi.fn()}
        onScriptEdit={vi.fn()}
      />,
    );

    // Title input
    const titleInput = screen.getByDisplayValue('Epic Opening Hook');
    expect(titleInput).toBeDefined();

    // Virality score
    expect(screen.getByText(/85/)).toBeDefined();

    // Clip type
    expect(screen.getByText('hook')).toBeDefined();

    // Duration (45 - 15 = 30 seconds → 0:30)
    expect(screen.getByText(/0:30/)).toBeDefined();
  });

  it('calls onToggle when the checkbox is clicked', () => {
    const onToggle = vi.fn();
    render(
      <HighlightReviewCard
        highlight={mockHighlight}
        selected={true}
        onToggle={onToggle}
        onTitleEdit={vi.fn()}
        onScriptEdit={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onScriptEdit when the summary textarea is changed', () => {
    const onScriptEdit = vi.fn();
    render(
      <HighlightReviewCard
        highlight={mockHighlight}
        selected={true}
        onToggle={vi.fn()}
        onTitleEdit={vi.fn()}
        onScriptEdit={onScriptEdit}
      />,
    );

    const textarea = screen.getByDisplayValue(mockHighlight.summary);
    fireEvent.change(textarea, { target: { value: 'Edited script content' } });
    expect(onScriptEdit).toHaveBeenCalledWith('Edited script content');
  });

  it('applies reduced opacity when not selected', () => {
    const { container } = render(
      <HighlightReviewCard
        highlight={mockHighlight}
        selected={false}
        onToggle={vi.fn()}
        onTitleEdit={vi.fn()}
        onScriptEdit={vi.fn()}
      />,
    );

    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('opacity-60');
  });

  it('renders tags as hashtags', () => {
    render(
      <HighlightReviewCard
        highlight={mockHighlight}
        selected={true}
        onToggle={vi.fn()}
        onTitleEdit={vi.fn()}
        onScriptEdit={vi.fn()}
      />,
    );

    expect(screen.getByText('#viral')).toBeDefined();
    expect(screen.getByText('#trending')).toBeDefined();
  });
});
