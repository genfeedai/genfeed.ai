import { ViewType } from '@genfeedai/enums';
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

    const calendarButton = screen
      .getByTestId('calendar-icon')
      .closest('button');
    expect(calendarButton).toHaveClass('bg-white/10');
    expect(calendarButton).toHaveClass('text-foreground');
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

    const calendarButton = screen
      .getByTestId('calendar-icon')
      .closest('button');
    fireEvent.click(calendarButton!);

    expect(updateViewToggle).toHaveBeenCalledWith(ViewType.CALENDAR);
  });

  it('applies inline-flex class for button group', () => {
    const updateViewToggle = vi.fn();
    const { container } = render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
      />,
    );

    // Component uses inline-flex for button group styling
    expect(container.querySelector('.inline-flex')).toBeInTheDocument();
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

  it('renders buttons for each option', () => {
    const updateViewToggle = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
      />,
    );

    // Verify all buttons are rendered
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);

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

    const listButton = screen.getByTestId('list-icon').closest('button');
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

    const listButton = screen.getByTestId('list-icon').closest('button');
    expect(listButton).toHaveAttribute('aria-label', 'Switch to list view');
  });

  it('applies correct button classes - ghost for all, elevated state for active', () => {
    const updateViewToggle = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={updateViewToggle}
      />,
    );

    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      // All buttons render with CVA buttonVariants
      expect(button).toBeInTheDocument();
    });

    // Active button keeps ghost styling but adds an emphasized active background
    const listButton = screen.getByTestId('list-icon').closest('button');
    expect(listButton).toHaveClass('bg-white/10');
    expect(listButton).toHaveClass('text-foreground');

    // Inactive buttons stay ghost with subdued text and no active fill
    const calendarButton = screen
      .getByTestId('calendar-icon')
      .closest('button');
    const gridButton = screen.getByTestId('grid-icon').closest('button');
    expect(calendarButton).toHaveClass('text-foreground/70');
    expect(gridButton).toHaveClass('text-foreground/70');
    expect(calendarButton).not.toHaveClass('bg-white/10');
    expect(gridButton).not.toHaveClass('bg-white/10');
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
    expect(screen.getAllByRole('button')).toHaveLength(1);
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

    expect(screen.getAllByRole('button')).toHaveLength(5);
  });
});
