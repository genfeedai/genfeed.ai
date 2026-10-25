import '@testing-library/jest-dom/vitest';
import { CardEmptySize } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { EmptyState, EmptyStateCard } from '@ui/card/EmptyState';
import { describe, expect, it, vi } from 'vitest';

const emptyStateComponents = [EmptyState, EmptyStateCard];

describe.each(emptyStateComponents)('EmptyState %s', (Empty) => {
  it('names the empty result and runs its recovery action', () => {
    const onClick = vi.fn();
    render(
      <Empty
        title="No saved drafts"
        action={{ label: 'Create draft', onClick }}
        size={CardEmptySize.LG}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'No saved drafts' }),
    ).toHaveClass('text-base');
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(onClick).toHaveBeenCalledExactlyOnceWith(expect.anything());
  });
});

it('keeps the bare empty state free of card chrome', () => {
  const { rerender } = render(
    <EmptyState
      title="No drafts"
      action={{ label: 'Create', onClick: vi.fn() }}
    />,
  );
  expect(screen.queryByTestId('card-empty')).not.toBeInTheDocument();
  rerender(
    <EmptyStateCard
      title="No drafts"
      action={{ label: 'Create', onClick: vi.fn() }}
    />,
  );
  expect(screen.getByTestId('card-empty')).toHaveClass(
    'bg-card',
    'rounded-card',
  );
});
