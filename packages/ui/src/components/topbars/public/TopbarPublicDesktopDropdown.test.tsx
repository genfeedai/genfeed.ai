import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import TopbarPublicDesktopDropdown from '@ui/topbars/public/TopbarPublicDesktopDropdown';
import { describe, expect, it } from 'vitest';

const ungroupedDropdown = {
  items: [{ href: '/pricing', label: 'Pricing' }],
  label: 'Product',
};

const groupedDropdown = {
  items: [{ group: 'Create', href: '/agent', label: 'Agent' }],
  label: 'Product',
};

function renderDropdown(
  overrides: Partial<
    React.ComponentProps<typeof TopbarPublicDesktopDropdown>
  > = {},
) {
  return render(
    <TopbarPublicDesktopDropdown
      currentDropdown={ungroupedDropdown}
      dropdownPosition={{ left: 0, top: 64 }}
      mounted
      onItemClick={() => {}}
      onMouseEnterDropdown={() => {}}
      onMouseLeaveDropdown={() => {}}
      openDropdown="Product"
      pathname="/"
      {...overrides}
    />,
  );
}

describe('TopbarPublicDesktopDropdown', () => {
  it('renders an open ungrouped menu as interactive', () => {
    renderDropdown();

    const panel = screen.getByRole('link', { name: 'Pricing' }).closest('div');
    expect(screen.getByRole('link', { name: 'Pricing' })).toBeInTheDocument();
    expect(panel).not.toHaveClass('pointer-events-none');
  });

  it('keeps a closed ungrouped menu non-interactive while it fades out', () => {
    const { rerender } = renderDropdown();

    // The panel outlives `openDropdown` for one motion cycle so it can fade.
    rerender(
      <TopbarPublicDesktopDropdown
        currentDropdown={undefined}
        dropdownPosition={{ left: 0, top: 64 }}
        mounted
        onItemClick={() => {}}
        onMouseEnterDropdown={() => {}}
        onMouseLeaveDropdown={() => {}}
        openDropdown={null}
        pathname="/"
      />,
    );

    // The closed panel is aria-hidden, so it is out of the accessibility tree:
    // query it with `hidden` rather than asserting it disappeared entirely.
    const link = screen.getByRole('link', { hidden: true, name: 'Pricing' });
    const panel = link.closest('[aria-hidden]');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveAttribute('inert');
    expect(panel).toHaveClass('pointer-events-none', 'opacity-0');
  });

  it('keeps a closed grouped menu non-interactive while it fades out', () => {
    const { rerender } = renderDropdown({ currentDropdown: groupedDropdown });

    rerender(
      <TopbarPublicDesktopDropdown
        currentDropdown={undefined}
        dropdownPosition={{ left: 0, top: 64 }}
        mounted
        onItemClick={() => {}}
        onMouseEnterDropdown={() => {}}
        onMouseLeaveDropdown={() => {}}
        openDropdown={null}
        pathname="/"
      />,
    );

    const panel = screen
      .getByRole('link', { hidden: true, name: /Agent/ })
      .closest('[aria-hidden]');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveAttribute('inert');
    expect(panel).toHaveClass('pointer-events-none');
  });
});
