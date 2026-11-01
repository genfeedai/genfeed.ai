import '@testing-library/jest-dom/vitest';
import { ButtonVariant, CardEmptySize } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from '@ui/primitives/empty-state';
import { Inbox } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

describe('EmptyState', () => {
  it('names what is empty and runs its recovery action', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No saved drafts"
        description="Drafts you save appear here."
        icon={Inbox}
        action={{
          label: 'Create draft',
          onClick,
          variant: ButtonVariant.DEFAULT,
        }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'No saved drafts' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Drafts you save appear here.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders custom actions in place of the single action button', () => {
    render(
      <EmptyState
        title="No tasks"
        action={{ label: 'Create task', onClick: () => undefined }}
        actions={<span>Retry</span>}
      />,
    );

    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create task' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    [CardEmptySize.LG, 'text-base'],
    [CardEmptySize.DEFAULT, 'text-sm'],
    [CardEmptySize.SM, 'text-sm'],
  ])('scales the title for size %s', (size, className) => {
    render(<EmptyState title="Nothing here" size={size} />);

    expect(screen.getByRole('heading', { name: 'Nothing here' })).toHaveClass(
      className,
    );
  });

  it('paints card chrome only for the card surface', () => {
    const { rerender } = render(<EmptyState title="No drafts" />);
    expect(screen.getByTestId('empty-state')).toHaveAttribute(
      'data-surface',
      'none',
    );
    expect(screen.queryByTestId('empty-state')?.closest('.rounded-card')).toBe(
      null,
    );

    rerender(<EmptyState surface="card" title="No drafts" />);
    expect(screen.getByTestId('empty-state')).toHaveAttribute(
      'data-surface',
      'card',
    );
    expect(
      screen.getByTestId('empty-state').closest('.rounded-card'),
    ).not.toBeNull();
  });

  it('fills its positioned parent when isFill is set', () => {
    render(<EmptyState title="No chart data" isFill />);

    expect(screen.getByTestId('empty-state')).toHaveClass(
      'absolute',
      'inset-0',
    );
  });

  it('shows an emoji glyph when no icon component is given', () => {
    render(<EmptyState glyph="📭" title="Nothing here yet" />);

    expect(screen.getByText('📭')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Nothing here yet' }),
    ).toBeInTheDocument();
  });
});
