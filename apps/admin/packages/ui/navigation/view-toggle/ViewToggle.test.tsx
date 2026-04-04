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
    const handleChange = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={handleChange}
      />,
    );

    expect(screen.getByTestId('list-icon')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-icon')).toBeInTheDocument();
    expect(screen.getByTestId('grid-icon')).toBeInTheDocument();
  });

  it('highlights active view', () => {
    const handleChange = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.CALENDAR}
        onChange={handleChange}
      />,
    );

    const calendarButton = screen
      .getByTestId('calendar-icon')
      .closest('button');
    expect(calendarButton).toHaveClass('bg-white/10');
    expect(calendarButton).toHaveClass('text-foreground');
  });

  it('calls onChange when view is clicked', () => {
    const handleChange = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={handleChange}
      />,
    );

    const calendarButton = screen
      .getByTestId('calendar-icon')
      .closest('button');
    fireEvent.click(calendarButton!);

    expect(handleChange).toHaveBeenCalledWith(ViewType.CALENDAR);
  });

  it('applies inline-flex class for button group', () => {
    const handleChange = vi.fn();
    const { container } = render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={handleChange}
      />,
    );

    // Component uses inline-flex for button group styling
    expect(container.querySelector('.inline-flex')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const handleChange = vi.fn();
    const { container } = render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={handleChange}
        className="custom-class"
      />,
    );

    const toggleContainer = container.querySelector('.custom-class');
    expect(toggleContainer).toBeInTheDocument();
  });

  it('renders buttons for each option', () => {
    const handleChange = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={handleChange}
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
    const handleChange = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={handleChange}
      />,
    );

    const listButton = screen.getByTestId('list-icon').closest('button');
    expect(listButton).toHaveAttribute('aria-label', 'List View');
  });

  it('uses custom ariaLabel when provided', () => {
    const handleChange = vi.fn();
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
        onChange={handleChange}
      />,
    );

    const listButton = screen.getByTestId('list-icon').closest('button');
    expect(listButton).toHaveAttribute('aria-label', 'Switch to list view');
  });

  it('applies correct button classes - ghost for all, elevated state for active', () => {
    const handleChange = vi.fn();
    render(
      <ViewToggle
        options={mockOptions}
        activeView={ViewType.LIST}
        onChange={handleChange}
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
    const handleChange = vi.fn();
    const singleOption = [mockOptions[0]];

    render(
      <ViewToggle
        options={singleOption}
        activeView={ViewType.LIST}
        onChange={handleChange}
      />,
    );

    expect(screen.getByTestId('list-icon')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('handles many options', () => {
    const handleChange = vi.fn();
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
        onChange={handleChange}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(5);
  });
});
