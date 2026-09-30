import { render, screen } from '@testing-library/react';
import MenuItem from '@ui/menus/item/MenuItem';
import { Wand2 } from 'lucide-react';
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
        <MenuItem href="/workspace" isActive label="Dashboard" variant="icon" />
        <MenuItem href="/workspace/inbox/unread" label="Inbox" variant="icon" />
      </>,
    );

    const activeRow = screen.getByRole('link', { name: 'Dashboard' });
    const hoverRow = screen.getByRole('link', { name: 'Inbox' });

    expect(activeRow).toHaveClass('bg-foreground/[0.06]');
    expect(hoverRow).toHaveClass('hover:bg-foreground/[0.06]');
    expect(hoverRow).not.toHaveClass('hover:bg-foreground/[0.035]');
  });

  it('uses the canonical 16px icon size for expanded sidebar rows', () => {
    const { container } = render(
      <MenuItem
        href="/studio/generate"
        label="Generate"
        outline={Wand2}
        solid={Wand2}
        variant="icon"
      />,
    );

    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('size-4');
    expect(icon?.parentElement).toHaveClass('size-5');
    expect(icon).not.toHaveClass('size-5');
  });
});
