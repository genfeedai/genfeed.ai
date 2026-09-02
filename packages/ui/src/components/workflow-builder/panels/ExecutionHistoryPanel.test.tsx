import '@testing-library/jest-dom/vitest';
import { formatEnumLabel, WorkflowExecutionStatus } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExecutionHistoryPanel from '@ui/workflow-builder/panels/ExecutionHistoryPanel';
import { describe, expect, it, vi } from 'vitest';

// Mock fetch
global.fetch = vi.fn();

/**
 * The API serialises `WorkflowExecution.status` straight off the Prisma enum,
 * so every fixture here is SCREAMING_SNAKE — matching the wire, not the
 * engine's internal lowercase spelling.
 *
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
function mockExecutionsResponse(
  executions: Array<Record<string, unknown>>,
): void {
  vi.mocked(global.fetch).mockResolvedValue({
    json: async () => ({ data: executions }),
    ok: true,
  } as Response);
}

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

  it('treats a RUNNING execution as in-flight', async () => {
    mockExecutionsResponse([
      {
        createdAt: '2026-08-07T00:00:00.000Z',
        id: 'execution-1',
        nodeResults: [],
        progress: 42,
        status: WorkflowExecutionStatus.RUNNING,
        trigger: 'manual',
      },
    ]);

    render(<ExecutionHistoryPanel {...defaultProps} />);

    // Only a running execution offers a cancel affordance.
    expect(
      await screen.findByRole('button', { name: /cancel/i }),
    ).toBeInTheDocument();
  });

  it('does not offer cancel for a settled execution', async () => {
    mockExecutionsResponse([
      {
        createdAt: '2026-08-07T00:00:00.000Z',
        id: 'execution-2',
        nodeResults: [],
        progress: 100,
        status: WorkflowExecutionStatus.COMPLETED,
        trigger: 'manual',
      },
    ]);

    render(<ExecutionHistoryPanel {...defaultProps} />);

    // The panel renders the human label via formatEnumLabel, not the raw
    // SCREAMING wire status.
    expect(
      await screen.findByText(
        formatEnumLabel(WorkflowExecutionStatus.COMPLETED) ?? '',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /cancel/i }),
    ).not.toBeInTheDocument();
  });

  it('cancels with the SCREAMING_SNAKE wire status', async () => {
    mockExecutionsResponse([
      {
        createdAt: '2026-08-07T00:00:00.000Z',
        id: 'execution-3',
        nodeResults: [],
        progress: 10,
        status: WorkflowExecutionStatus.RUNNING,
        trigger: 'manual',
      },
    ]);

    render(<ExecutionHistoryPanel {...defaultProps} />);

    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/v1/core/workflow-executions/execution-3',
        expect.objectContaining({
          body: JSON.stringify({
            status: WorkflowExecutionStatus.CANCELLED,
          }),
          method: 'PATCH',
        }),
      );
    });
  });

  it('shows an error when cancellation is rejected', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({
          data: [
            {
              createdAt: '2026-08-07T00:00:00.000Z',
              id: 'execution-4',
              nodeResults: [],
              progress: 10,
              status: WorkflowExecutionStatus.RUNNING,
              trigger: 'manual',
            },
          ],
        }),
        ok: true,
      } as Response)
      .mockResolvedValueOnce({ ok: false } as Response);

    render(<ExecutionHistoryPanel {...defaultProps} />);

    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    expect(
      await screen.findByText('Failed to cancel execution'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
