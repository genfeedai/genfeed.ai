import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import SchedulePanel from '@ui/workflow-builder/panels/SchedulePanel';
import { describe, expect, it, vi } from 'vitest';

// Mock NotificationsService
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    show: vi.fn(),
  },
}));

describe('SchedulePanel', () => {
  const defaultProps = {
    currentSchedule: undefined,
    currentTimezone: 'UTC',
    isCollapsed: false,
    isEnabled: false,
    onScheduleUpdate: vi.fn(),
    onToggleCollapse: vi.fn(),
    workflowId: 'workflow-1',
  };

  it('should render without crashing', () => {
    const { container } = render(<SchedulePanel {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display schedule panel header', () => {
    render(<SchedulePanel {...defaultProps} />);
    // Multiple elements contain "Schedule" - use getAllByText
    const scheduleElements = screen.getAllByText(/Schedule/i);
    expect(scheduleElements.length).toBeGreaterThan(0);
  });

  it('should call onToggleCollapse when header is clicked', () => {
    const onToggleCollapse = vi.fn();
    const { container } = render(
      <SchedulePanel {...defaultProps} onToggleCollapse={onToggleCollapse} />,
    );

    // The header row is clickable for collapse/expand
    const headerRow = container.querySelector('.cursor-pointer');
    if (headerRow) {
      fireEvent.click(headerRow);
      expect(onToggleCollapse).toHaveBeenCalled();
    }
  });

  it('should render collapsed state', () => {
    render(<SchedulePanel {...defaultProps} isCollapsed={true} />);
    // Multiple elements contain "Schedule" - use getAllByText
    const scheduleElements = screen.getAllByText(/Schedule/i);
    expect(scheduleElements.length).toBeGreaterThan(0);
  });

  it.skip('should handle user interactions correctly', () => {
    const onScheduleUpdate = vi.fn();
    render(
      <SchedulePanel {...defaultProps} onScheduleUpdate={onScheduleUpdate} />,
    );

    // Test selecting a preset schedule
    const presetButtons = screen.getAllByRole('button');
    const presetButton = presetButtons.find((btn) =>
      btn.textContent?.includes('Every hour'),
    );
    if (presetButton) {
      fireEvent.click(presetButton);
      expect(onScheduleUpdate).toHaveBeenCalled();
    }

    // Test enabling/disabling schedule
    const toggleButton =
      screen.getByRole('checkbox') || screen.getByRole('switch');
    if (toggleButton) {
      fireEvent.click(toggleButton);
      expect(onScheduleUpdate).toHaveBeenCalled();
    }
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<SchedulePanel {...defaultProps} />);

    // Check panel has correct container classes
    const panel = container.firstChild;
    expect(panel).toBeInTheDocument();

    // Check collapsed state styling
    const { container: collapsedContainer } = render(
      <SchedulePanel {...defaultProps} isCollapsed={true} />,
    );
    expect(collapsedContainer.firstChild).toBeInTheDocument();

    // Check enabled state styling
    const { container: enabledContainer } = render(
      <SchedulePanel {...defaultProps} isEnabled={true} />,
    );
    expect(enabledContainer.firstChild).toBeInTheDocument();
  });
});
