// @vitest-environment jsdom
import type { SwitcherDropdownItem } from '@genfeedai/props/ui/menus/switcher-dropdown.props';
import { fireEvent, render, screen } from '@testing-library/react';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import { Settings } from 'lucide-react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const items: SwitcherDropdownItem[] = [
  { id: '1', isActive: true, label: 'Alpha' },
  { id: '2', isActive: false, label: 'Beta' },
  { id: '3', isActive: false, label: 'Gamma' },
];

function renderDropdown(overrides = {}) {
  const defaultProps = {
    items,
    onSelect: vi.fn(),
    renderTrigger: ({ isOpen }: { isOpen: boolean; isDisabled: boolean }) => (
      <button type="button">{isOpen ? 'Close' : 'Open'}</button>
    ),
    ...overrides,
  };

  return {
    ...render(<SwitcherDropdown {...defaultProps} />),
    props: defaultProps,
  };
}

describe('SwitcherDropdown', () => {
  beforeEach(() => {
    class MockResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }

    globalThis.ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver;

    // cmdk calls scrollIntoView on the highlighted item; jsdom lacks it.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders the trigger', () => {
    renderDropdown();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('opens dropdown on trigger click', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('calls onSelect when clicking a non-active item', () => {
    const onSelect = vi.fn();
    renderDropdown({ onSelect });
    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(screen.getByText('Beta'));
    expect(onSelect).toHaveBeenCalledWith('2');
  });

  it('does not call onSelect for active item', () => {
    const onSelect = vi.fn();
    renderDropdown({ onSelect });
    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(screen.getByText('Alpha'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('exposes listbox/option roles and marks the active row with aria-current', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('Open'));

    // cmdk renders a listbox of options (was a plain list of buttons before).
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);

    // Active stays selectable (so cmdk keyboard cursor can rest on it) and
    // shows the check — never a disabled skip that lights the next brand.
    const activeOption = options.find((option) =>
      option.textContent?.includes('Alpha'),
    );
    expect(activeOption).toHaveAttribute('aria-current', 'true');
    expect(activeOption).not.toHaveAttribute('aria-disabled', 'true');
    expect(activeOption?.querySelector('svg')).not.toBeNull();
  });

  it('renders item fallback avatars as square marks', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('Open'));

    const avatar = screen.getAllByRole('option')[0]?.querySelector('.size-5');

    expect(avatar).toHaveClass('rounded-md');
    expect(avatar).not.toHaveClass('rounded-full');
  });

  it('selects the highlighted item via arrow-down + Enter (cmdk keyboard nav)', () => {
    const onSelect = vi.fn();
    renderDropdown({ hasSearch: true, onSelect });
    fireEvent.click(screen.getByText('Open'));

    const input = screen.getByPlaceholderText('Search…');
    // Cursor starts on active Alpha. ArrowDown → Beta; Enter selects Beta.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('2');
  });

  it('does not re-fire onSelect when confirming the already-active item', () => {
    const onSelect = vi.fn();
    renderDropdown({ hasSearch: true, onSelect });
    fireEvent.click(screen.getByText('Open'));

    const input = screen.getByPlaceholderText('Search…');
    // Cursor starts on active Alpha; Enter should only close.
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onOpenChange when opening', () => {
    const onOpenChange = vi.fn();
    renderDropdown({ onOpenChange });
    fireEvent.click(screen.getByText('Open'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('renders footer action', () => {
    const onAction = vi.fn();
    renderDropdown({
      footerActions: [
        { label: 'Settings', onAction: vi.fn() },
        { label: 'New Item', onAction },
      ],
    });
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('Settings')).toBeInTheDocument();
    const footer = screen.getByText('New Item');
    expect(footer).toBeInTheDocument();
    fireEvent.click(footer);
    expect(onAction).toHaveBeenCalled();
  });

  it('renders multiple footer actions when provided', () => {
    const onSettings = vi.fn();
    const onCreate = vi.fn();
    renderDropdown({
      footerActions: [
        { label: 'Settings', onAction: onSettings },
        { label: 'Create', onAction: onCreate },
      ],
    });

    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(screen.getByText('Settings'));
    expect(onSettings).toHaveBeenCalled();
  });

  it('renders footer icons passed as component types', () => {
    renderDropdown({
      footerActions: [
        {
          icon: Settings,
          label: 'Settings',
          onAction: vi.fn(),
        },
      ],
    });

    fireEvent.click(screen.getByText('Open'));

    const settingsButton = screen.getByRole('button', { name: /settings/i });
    expect(settingsButton.querySelector('svg')).not.toBeNull();
  });

  it('renders per-row trailing actions without selecting the item', () => {
    const onAction = vi.fn();
    const onSelect = vi.fn();

    renderDropdown({
      items: [
        {
          id: '1',
          isActive: false,
          label: 'Alpha',
          trailingAction: {
            ariaLabel: 'Open Alpha settings',
            icon: Settings,
            onAction,
          },
        },
      ],
      onSelect,
    });

    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Alpha settings' }),
    );

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('gives the active item the selected wash; inactive rows get a lighter hover wash', () => {
    renderDropdown({
      items: [
        {
          id: '1',
          isActive: true,
          label: 'Alpha',
          trailingAction: {
            ariaLabel: 'Open Alpha settings',
            icon: Settings,
            onAction: vi.fn(),
          },
        },
        {
          id: '2',
          isActive: false,
          label: 'Beta',
          trailingAction: {
            ariaLabel: 'Open Beta settings',
            icon: Settings,
            onAction: vi.fn(),
          },
        },
      ],
    });

    fireEvent.click(screen.getByText('Open'));

    const alphaSettings = screen.getByRole('button', {
      name: 'Open Alpha settings',
    });
    const betaSettings = screen.getByRole('button', {
      name: 'Open Beta settings',
    });
    const alphaRow = alphaSettings.parentElement;
    const betaRow = betaSettings.parentElement;

    // Active row: persistent selected wash + check
    expect(alphaRow).toHaveClass('bg-foreground/[0.08]');
    expect(alphaRow).not.toHaveClass('hover:bg-foreground/[0.05]');
    expect(
      screen.getByTestId('switcher-item-active-check'),
    ).toBeInTheDocument();

    // Inactive row: hover only — never the active selected wash
    expect(betaRow).toHaveClass('hover:bg-foreground/[0.04]');
    expect(betaRow).not.toHaveClass('bg-foreground/[0.08]');
    expect(screen.queryAllByTestId('switcher-item-active-check')).toHaveLength(
      1,
    );
  });

  it('shows search when hasSearch is true', () => {
    renderDropdown({ hasSearch: true, searchPlaceholder: 'Find…' });
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByPlaceholderText('Find…')).toBeInTheDocument();
  });

  it('hides search when hasSearch is false', () => {
    renderDropdown({ hasSearch: false });
    fireEvent.click(screen.getByText('Open'));
    expect(screen.queryByPlaceholderText('Search…')).not.toBeInTheDocument();
  });

  it('filters items by search term', () => {
    renderDropdown({ hasSearch: true });
    fireEvent.click(screen.getByText('Open'));
    const input = screen.getByPlaceholderText('Search…');
    fireEvent.change(input, { target: { value: 'bet' } });
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument();
  });

  it('shows loading state when there are no items', () => {
    renderDropdown({ items: [] });
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an explicit empty message after loading completes', () => {
    renderDropdown({
      emptyMessage: 'No organizations',
      isLoading: false,
      items: [],
    });
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('No organizations')).toBeInTheDocument();
  });

  it('does not render browser-default focus rings on footer actions', () => {
    renderDropdown({
      footerActions: [{ label: 'New Item', onAction: vi.fn() }],
    });
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByRole('button', { name: /New Item/i })).toHaveClass(
      'focus-visible:ring-0',
    );
  });

  it('disables interaction when isDisabled', () => {
    const onSelect = vi.fn();
    renderDropdown({ isDisabled: true, onSelect });
    fireEvent.click(screen.getByText('Open'));
    // Dropdown should not open when disabled
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });
});
