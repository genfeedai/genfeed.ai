import { render, screen } from '@testing-library/react';
import { Wand2 } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import MenuItem from '@/components/menus/item/MenuItem';

const Outline = (props: { className?: string }) => (
  <svg data-icon="outline" {...props} />
);
const Solid = (props: { className?: string }) => (
  <svg data-icon="solid" {...props} />
);

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
        href="/workspace/inbox"
        variant="icon"
      />,
    );

    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('shows the active fill as a highlight with the hover fill token, not a row class', () => {
    render(
      <>
        <MenuItem href="/workspace" isActive label="Dashboard" variant="icon" />
        <MenuItem href="/workspace/inbox" label="Inbox" variant="icon" />
      </>,
    );

    const activeRow = screen.getByRole('link', { name: 'Dashboard' });
    const hoverRow = screen.getByRole('link', { name: 'Inbox' });

    expect(
      activeRow.querySelector('[data-sidebar-active-highlight]'),
    ).toHaveClass('bg-foreground/5');
    expect(activeRow).not.toHaveClass('bg-foreground/5');
    expect(
      hoverRow.querySelector('[data-sidebar-active-highlight]'),
    ).toBeNull();
    expect(hoverRow).toHaveClass('hover:bg-foreground/5');
  });

  it('moves the highlight to the row that becomes active', () => {
    const { rerender } = render(
      <>
        <MenuItem href="/workspace" isActive label="Dashboard" variant="icon" />
        <MenuItem href="/workspace/inbox" label="Inbox" variant="icon" />
      </>,
    );

    rerender(
      <>
        <MenuItem href="/workspace" label="Dashboard" variant="icon" />
        <MenuItem
          href="/workspace/inbox"
          isActive
          label="Inbox"
          variant="icon"
        />
      </>,
    );

    expect(
      screen
        .getByRole('link', { name: 'Dashboard' })
        .querySelector('[data-sidebar-active-highlight]'),
    ).toBeNull();
    expect(
      screen
        .getByRole('link', { name: 'Inbox' })
        .querySelector('[data-sidebar-active-highlight]'),
    ).not.toBeNull();
  });

  it('keeps the label weight and the outline icon when the row becomes active', () => {
    const { rerender } = render(
      <MenuItem
        href="/workspace"
        label="Dashboard"
        outline={Outline}
        solid={Solid}
        variant="icon"
      />,
    );
    rerender(
      <MenuItem
        href="/workspace"
        isActive
        label="Dashboard"
        outline={Outline}
        solid={Solid}
        variant="icon"
      />,
    );

    expect(screen.getByText('Dashboard')).not.toHaveClass('font-semibold');
    expect(
      screen
        .getByRole('link', { name: 'Dashboard' })
        .querySelector('[data-icon]'),
    ).toHaveAttribute('data-icon', 'outline');
  });

  it('uses the canonical 16px icon size for expanded sidebar rows', () => {
    const { container } = render(
      <MenuItem
        href="/playground"
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
