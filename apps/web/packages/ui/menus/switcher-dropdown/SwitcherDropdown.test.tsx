// @vitest-environment jsdom
import type { SwitcherDropdownItem } from '@props/ui/menus/switcher-dropdown.props';
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

  it('shows search when hasSearch is true', () => {
    renderDropdown({ hasSearch: true, searchPlaceholder: 'Find...' });
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByPlaceholderText('Find...')).toBeInTheDocument();
  });

  it('hides search when hasSearch is false', () => {
    renderDropdown({ hasSearch: false });
    fireEvent.click(screen.getByText('Open'));
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
  });

  it('filters items by search term', () => {
    renderDropdown({ hasSearch: true });
    fireEvent.click(screen.getByText('Open'));
    const input = screen.getByPlaceholderText('Search...');
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

  it('disables interaction when isDisabled', () => {
    const onSelect = vi.fn();
    renderDropdown({ isDisabled: true, onSelect });
    fireEvent.click(screen.getByText('Open'));
    // Dropdown should not open when disabled
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });
});
