// @vitest-environment jsdom
import type { SwitcherDropdownItem } from '@genfeedai/props/ui/menus/switcher-dropdown.props';
import { fireEvent, render, screen } from '@testing-library/react';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import { HiOutlineCog6Tooth } from 'react-icons/hi2';
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

  it('exposes listbox/option roles and marks the active row non-selectable', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('Open'));

    // cmdk renders a listbox of options (was a plain list of buttons before).
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);

    // The active row (Alpha) is disabled and shows the check.
    const activeOption = options.find((option) =>
      option.textContent?.includes('Alpha'),
    );
    expect(activeOption).toHaveAttribute('aria-disabled', 'true');
    expect(activeOption?.querySelector('svg')).not.toBeNull();
  });

  it('selects the highlighted item via arrow-down + Enter (cmdk keyboard nav)', () => {
    const onSelect = vi.fn();
    renderDropdown({ hasSearch: true, onSelect });
    fireEvent.click(screen.getByText('Open'));

    const input = screen.getByPlaceholderText('Search…');
    // Active row (Alpha) is skipped by cmdk, so the initial highlight is Beta.
    // ArrowDown moves it to Gamma; Enter selects the highlighted item.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('3');
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
          icon: HiOutlineCog6Tooth,
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
            icon: HiOutlineCog6Tooth,
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
