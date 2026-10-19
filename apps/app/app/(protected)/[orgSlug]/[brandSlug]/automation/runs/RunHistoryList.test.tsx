import '@testing-library/jest-dom/vitest';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RunHistoryList from './RunHistoryList';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand${path}` }),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));

function makeExecutions(count: number): IWorkflowExecution[] {
  return Array.from({ length: count }, (_, index) => ({
    createdAt: '2026-10-01T10:00:00.000Z',
    id: `exec-${index}`,
    status: 'COMPLETED',
    workflow: { label: `Workflow ${index}` },
  })) as unknown as IWorkflowExecution[];
}

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
});
