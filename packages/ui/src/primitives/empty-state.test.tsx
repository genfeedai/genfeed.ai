import '@testing-library/jest-dom/vitest';
import { CardEmptySize } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { EmptyState, EmptyStateCard } from '@ui/primitives/empty-state';
import { describe, expect, it, vi } from 'vitest';

describe.each([
  ['EmptyState', EmptyState],
  ['EmptyStateCard', EmptyStateCard],
])('%s', (_name, Empty) => {
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
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders only the title when there is nothing to do next', () => {
    render(<Empty title="No messages yet" />);

    expect(
      screen.getByRole('heading', { name: 'No messages yet' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the description and prefers a custom actions slot', () => {
    render(
      <Empty
        title="No tasks"
        description="Create one to get going."
        action={{ label: 'Create task', onClick: vi.fn() }}
        actions={<a href="/tasks/new">Browse templates</a>}
      />,
    );

    expect(screen.getByText('Create one to get going.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Browse templates' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create task' }),
    ).not.toBeInTheDocument();
  });
});

it('keeps the bare empty state free of card chrome', () => {
  const { rerender } = render(<EmptyState title="No drafts" />);
  expect(screen.queryByTestId('empty-state-card')).not.toBeInTheDocument();

  rerender(<EmptyStateCard title="No drafts" />);
  expect(screen.getByTestId('empty-state-card')).toHaveClass(
    'bg-card',
    'rounded-card',
  );
});

it('owns padding through size', () => {
  const { container, rerender } = render(
    <EmptyState size={CardEmptySize.SM} title="Nothing" />,
  );
  expect(container.firstElementChild).toHaveClass('py-6');

  rerender(<EmptyState title="Nothing" />);
  expect(container.firstElementChild).toHaveClass('py-10');
});
