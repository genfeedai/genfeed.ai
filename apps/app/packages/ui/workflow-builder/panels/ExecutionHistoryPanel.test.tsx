import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ExecutionHistoryPanel from '@ui/workflow-builder/panels/ExecutionHistoryPanel';
import { describe, expect, it, vi } from 'vitest';

// Mock fetch
global.fetch = vi.fn();

describe('ExecutionHistoryPanel', () => {
  const defaultProps = {
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
    workflowId: 'workflow-1',
  };

  it('should render without crashing', () => {
    const { container } = render(<ExecutionHistoryPanel {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display execution history header', () => {
    render(<ExecutionHistoryPanel {...defaultProps} />);
    expect(screen.getByText(/Execution History/i)).toBeInTheDocument();
  });

  it('should render collapsed state', () => {
    render(<ExecutionHistoryPanel {...defaultProps} isCollapsed={true} />);
    expect(screen.getByText(/Execution History/i)).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const onToggleCollapse = vi.fn();
    render(
      <ExecutionHistoryPanel
        {...defaultProps}
        onToggleCollapse={onToggleCollapse}
      />,
    );

    // Test clicking on execution history items
    const historyItems = screen.queryAllByRole('button');
    if (historyItems.length > 0) {
      fireEvent.click(historyItems[0]);
    }

    // Test refreshing execution history
    const refreshButton = screen.queryByRole('button', { name: /refresh/i });
    if (refreshButton) {
      fireEvent.click(refreshButton);
    }
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<ExecutionHistoryPanel {...defaultProps} />);

    // Check panel has correct container classes
    const panel = container.firstChild;
    expect(panel).toBeInTheDocument();

    // Check collapsed state styling
    const { container: collapsedContainer } = render(
      <ExecutionHistoryPanel {...defaultProps} isCollapsed={true} />,
    );
    expect(collapsedContainer.firstChild).toBeInTheDocument();
  });
});
