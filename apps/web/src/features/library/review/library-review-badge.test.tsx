import { LibraryReviewState } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LibraryReviewBadge from './library-review-badge';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('LibraryReviewBadge (#9948)', () => {
  it.each([
    [LibraryReviewState.IN_REVIEW, 'In review'],
    [LibraryReviewState.APPROVED, 'Approved'],
    [LibraryReviewState.CHANGES_REQUESTED, 'Changes requested'],
  ])('names %s in words, not only a colour', (state, label) => {
    render(<LibraryReviewBadge state={state} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows nothing for an asset nobody was asked to review', () => {
    const { container } = render(<LibraryReviewBadge state={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
