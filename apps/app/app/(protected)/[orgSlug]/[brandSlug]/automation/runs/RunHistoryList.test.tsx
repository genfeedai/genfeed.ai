import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RunHistoryList from './RunHistoryList';

interface MockTableProps {
  columns: Array<{
    key: string;
    render?: (item: IWorkflowExecution) => React.ReactNode;
  }>;
  getRowLink?: (item: IWorkflowExecution) => {
    href: string;
    label: string;
  };
  items: IWorkflowExecution[];
  rowSidebar?: {
    getTitle: (item: IWorkflowExecution) => string;
    kind: string;
    render: (item: IWorkflowExecution) => React.ReactNode;
  };
}

const tableProps = vi.hoisted(() => ({
  current: undefined as MockTableProps | undefined,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/demo${path}` }),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: (props: MockTableProps) => {
    tableProps.current = props;
    const labelColumn = props.columns.find((column) => column.key === 'label');
    return (
      <div data-testid="runs-table">
        {props.items.map((item) => (
          <div key={item.id}>{labelColumn?.render?.(item)}</div>
        ))}
      </div>
    );
  },
}));

function makeExecutions(count: number): IWorkflowExecution[] {
  return Array.from({ length: count }, (_, index) => ({
    createdAt: '2026-10-01T10:00:00.000Z',
    id: `exec-${index}`,
    status: 'COMPLETED',
    workflow: { label: `Workflow ${index}` },
  })) as unknown as IWorkflowExecution[];
}

const execution = {
  createdAt: '2026-09-01T10:00:00.000Z',
  durationMs: 4200,
  error: 'Provider timed out',
  failedNodeId: 'node-3',
  id: 'run-1',
  status: WorkflowExecutionStatus.FAILED,
  workflow: { id: 'wf-1', label: 'Weekly recap' },
  workflowId: 'wf-1',
} as unknown as IWorkflowExecution;

describe('RunHistoryList', () => {
  it('renders every row it is given without slicing client-side', () => {
    render(
      <RunHistoryList
        executions={makeExecutions(25)}
        isLoading={false}
        isPaginated
      />,
    );

    expect(screen.getByText('Workflow 24')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
  });

  it('omits pagination unless the list is server-paged', () => {
    render(<RunHistoryList executions={makeExecutions(3)} isLoading={false} />);

    expect(screen.queryByRole('navigation', { name: 'pagination' })).toBeNull();
  });

  it('links the run name to its page and summarises the run in the sidebar', () => {
    render(<RunHistoryList executions={[execution]} isLoading={false} />);

    const { getRowLink, rowSidebar } = tableProps.current ?? {};
    expect(getRowLink?.(execution)).toEqual({
      href: '/acme/demo/automation/runs/run-1',
      label: 'Weekly recap',
    });
    expect(rowSidebar?.kind).toBe('run');
    expect(rowSidebar?.getTitle(execution)).toBe('Weekly recap');

    render(<>{rowSidebar?.render(execution)}</>);
    const summary = screen.getByTestId('table-row-summary');
    expect(summary).toHaveTextContent('node-3: Provider timed out');
    expect(within(summary).getByRole('link')).toHaveAttribute(
      'href',
      '/acme/demo/automation/runs/run-1',
    );
  });
});
