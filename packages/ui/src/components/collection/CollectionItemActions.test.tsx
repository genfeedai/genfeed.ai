import { fireEvent, render, screen } from '@testing-library/react';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/primitives/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => (
    <div data-testid="overflow-menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    className,
    onSelect,
  }: {
    children?: ReactNode;
    className?: string;
    onSelect?: () => void;
  }) => (
    <div className={className} data-testid="overflow-item" onClick={onSelect}>
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <div data-testid="overflow-separator" />,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
}));

describe('CollectionItemActions', () => {
  it('renders nothing without a primary action or overflow', () => {
    const { container } = render(<CollectionItemActions />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the primary action and hides the overflow trigger when empty', () => {
    render(<CollectionItemActions primary={<span>Run now</span>} />);

    expect(screen.getByText('Run now')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More actions' }),
    ).not.toBeInTheDocument();
  });

  it('sorts destructive actions last, below a separator', () => {
    const onDelete = vi.fn();
    render(
      <CollectionItemActions
        overflow={[
          {
            id: 'delete',
            isDestructive: true,
            label: 'Delete',
            onSelect: onDelete,
          },
          { id: 'rename', label: 'Rename', onSelect: vi.fn() },
        ]}
        primary={<span>Open</span>}
      />,
    );

    const items = screen.getAllByTestId('overflow-item');
    expect(items.map((item) => item.textContent)).toEqual(['Rename', 'Delete']);
    expect(items[1]).toHaveClass('text-destructive');
    expect(screen.getByTestId('overflow-separator')).toBeInTheDocument();

    fireEvent.click(items[1]);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not let an action click reach a clickable parent', () => {
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <CollectionItemActions primary={<span>Run now</span>} />
      </div>,
    );

    fireEvent.click(screen.getByText('Run now'));
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
