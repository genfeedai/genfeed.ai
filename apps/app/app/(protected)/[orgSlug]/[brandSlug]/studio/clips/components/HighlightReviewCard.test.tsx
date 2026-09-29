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
});
