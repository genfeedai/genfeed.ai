import { ViewType } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { describe, expect, it, vi } from 'vitest';

describe('ViewToggle', () => {
  const mockOptions = [
    {
      icon: <span data-testid="list-icon">📋</span>,
      label: 'List View',
      type: ViewType.LIST,
    },
    {
      icon: <span data-testid="calendar-icon">📅</span>,
      label: 'Calendar View',
      type: ViewType.CALENDAR,
    },
    {
      icon: <span data-testid="grid-icon">⊞</span>,
      label: 'Grid View',
      type: ViewType.GRID,
    },
  ];

  it('renders all view options', () => {
    const updateViewToggle = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
      />,
    );

    expect(screen.getByTestId('list-icon')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-icon')).toBeInTheDocument();
    expect(screen.getByTestId('grid-icon')).toBeInTheDocument();
  });

  it('highlights active view', () => {
    const updateViewToggle = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.CALENDAR}
        onChange={updateViewToggle}
      />,
    );

    const calendarButton = screen.getByRole('radio', {
      name: 'Calendar View',
    });
    expect(calendarButton).toHaveAttribute('data-state', 'on');
    expect(calendarButton).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange when view is clicked', () => {
    const updateViewToggle = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Calendar View' }));

    expect(updateViewToggle).toHaveBeenCalledWith(ViewType.CALENDAR);
  });

  it('renders the shared segmented control', () => {
    const updateViewToggle = vi.fn();
    const { container } = render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
      />,
    );

    expect(container.querySelector('.gen-shell-segmented')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'View' })).toBeVisible();
  });

  it('uses sm toggle tier so shell icons are size-3.5 (not default size-4)', () => {
    const updateViewToggle = vi.fn();
    render(
      <ViewToggle
        options={[
          {
            icon: <svg data-testid="masonry-svg" className="size-3.5" />,
            label: 'Masonry view',
            type: ViewType.MASONRY,
          },
        ]}
        activeView={ViewType.MASONRY}
        onChange={updateViewToggle}
      />,
    );

    const item = screen.getByRole('radio', { name: 'Masonry view' });
    // sm size variant from toggleVariants
    expect(item.className).toMatch(/size-3\.5|h-8/);
    expect(item.className).toContain('size-7');
  });

  it('applies custom className', () => {
    const updateViewToggle = vi.fn();
    const { container } = render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
        className="custom-class"
      />,
    );

    const toggleContainer = container.querySelector('.custom-class');
    expect(toggleContainer).toBeInTheDocument();
  });

  it('renders radio controls for each option', () => {
    const updateViewToggle = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
      />,
    );

    const controls = screen.getAllByRole('radio');
    expect(controls).toHaveLength(3);

    // Each button should have the icon
    expect(
      screen.getByTestId('list-icon').closest('button'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('calendar-icon').closest('button'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('grid-icon').closest('button'),
    ).toBeInTheDocument();
  });

  it('sets aria-label for accessibility', () => {
    const updateViewToggle = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
      />,
    );

    const listButton = screen.getByRole('radio', { name: 'List View' });
    expect(listButton).toHaveAttribute('aria-label', 'List View');
  });

  it('uses custom ariaLabel when provided', () => {
    const updateViewToggle = vi.fn();
    const optionsWithAriaLabel = [
      {
        ariaLabel: 'Switch to list view',
        icon: <span data-testid="list-icon">📋</span>,
        label: 'List View',
        type: ViewType.LIST,
      },
    ];

    render(
      <ViewToggle
        options={optionsWithAriaLabel}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
      />,
    );

    const listButton = screen.getByRole('radio', {
      name: 'Switch to list view',
    });
    expect(listButton).toHaveAttribute('aria-label', 'Switch to list view');
  });

  it('exposes a single active item through the toggle-group state', () => {
    const updateViewToggle = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
      />,
    );

    const listButton = screen.getByRole('radio', { name: 'List View' });
    const calendarButton = screen.getByRole('radio', {
      name: 'Calendar View',
    });
    const gridButton = screen.getByRole('radio', { name: 'Grid View' });

    expect(listButton).toHaveAttribute('data-state', 'on');
    expect(listButton).toHaveAttribute('aria-checked', 'true');
    expect(calendarButton).toHaveAttribute('data-state', 'off');
    expect(calendarButton).toHaveAttribute('aria-checked', 'false');
    expect(gridButton).toHaveAttribute('data-state', 'off');
    expect(gridButton).toHaveAttribute('aria-checked', 'false');
  });

  it('handles single option', () => {
    const updateViewToggle = vi.fn();
    const singleOption = [mockOptions[0]];

    render(
      <ViewToggle
        options={singleOption}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
      />,
    );

    expect(screen.getByTestId('list-icon')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });

  it('handles many options', () => {
    const updateViewToggle = vi.fn();
    const manyOptions = [
      ...mockOptions,
      {
        icon: <span data-testid="table-icon">⊞</span>,
        label: 'Table View',
        type: ViewType.TABLE,
      },
      {
        icon: <span data-testid="kanban-icon">📊</span>,
        label: 'Kanban View',
        type: 'kanban' as ViewType,
      },
    ];

    render(
      <ViewToggle
        options={manyOptions}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });
});
