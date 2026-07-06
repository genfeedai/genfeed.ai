import { render, screen } from '@testing-library/react';
import MenuItem from '@ui/menus/item/MenuItem';
import { describe, expect, it } from 'vitest';

describe('MenuItem', () => {
  it('should render without crashing', () => {
    const { container } = render(<MenuItem label="Inbox" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<MenuItem label="Inbox" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<MenuItem label="Inbox" />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('renders a badge count inline for expanded icon rows', () => {
    render(
      <MenuItem
        badgeCount={40}
        label="Inbox"
        href="/workspace/inbox/unread"
        variant="icon"
      />,
    );

    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('uses the active row fill as the expanded sidebar hover fill', () => {
    render(
      <>
        <MenuItem
          href="/workspace/overview"
          isActive
          label="Dashboard"
          variant="icon"
        />
        <MenuItem href="/workspace/inbox/unread" label="Inbox" variant="icon" />
      </>,
    );

    const activeRow = screen.getByRole('link', { name: 'Dashboard' });
    const hoverRow = screen.getByRole('link', { name: 'Inbox' });

    expect(activeRow).toHaveClass('bg-foreground/[0.06]');
    expect(hoverRow).toHaveClass('hover:bg-foreground/[0.06]');
    expect(hoverRow).not.toHaveClass('hover:bg-foreground/[0.035]');
  });
});
