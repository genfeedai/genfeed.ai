import '@testing-library/jest-dom/vitest';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BatchHistoryList from './BatchHistoryList';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@/components/ui/client-formatted-date', () => ({
  ClientFormattedDate: ({ fallback }: { fallback: string }) => (
    <span>{fallback}</span>
  ),
}));

describe('BatchHistoryList', () => {
  it('renders each history entry as a full-width row, not an inline-wrapped button', () => {
    render(
      <BatchHistoryList
        recentExecutions={[
          {
            completedCount: 2,
            createdAt: '2026-09-01T00:00:00.000Z',
            failedCount: 0,
            id: 'execution-a',
            status: WorkflowExecutionStatus.COMPLETED,
            totalCount: 2,
            workflowId: 'workflow-a',
          },
          {
            completedCount: 1,
            createdAt: '2026-09-02T00:00:00.000Z',
            failedCount: 0,
            id: 'execution-b',
            status: WorkflowExecutionStatus.RUNNING,
            totalCount: 3,
            workflowId: 'workflow-a',
          },
        ]}
        workflowsById={new Map()}
        onOpenRecentExecution={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      // withWrapper={false} makes the Button itself the w-full row element,
      // instead of an inline-flex wrapper that lets rows flow side by side.
      expect(row).toHaveClass('w-full');
      expect(row.parentElement?.tagName).toBe('DIV');
      expect(row.parentElement).toHaveClass('divide-y');
    }
  });
});
