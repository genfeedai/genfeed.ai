import '@testing-library/jest-dom/vitest';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BatchDetail from './BatchDetail';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('Batch output collection', () => {
  it('uses shared square cards in a container grid and keeps failed output details local', () => {
    render(
      <BatchDetail
        activeBatchStatus={{
          id: 'batch',
          workflowId: 'workflow',
          status: WorkflowExecutionStatus.COMPLETED,
          totalCount: 2,
          completedCount: 1,
          failedCount: 1,
          items: [
            {
              id: 'ready',
              ingredientId: 'source-a',
              status: WorkflowExecutionStatus.COMPLETED,
            },
            {
              id: 'failed',
              ingredientId: 'source-b',
              status: WorkflowExecutionStatus.FAILED,
              error: 'Output failed',
            },
          ],
        }}
        availableOutputs={[]}
        selectedOutputs={[]}
        selectedOutputIds={new Set()}
        isRunningBulkAction={false}
        workflowsById={new Map()}
        onBackToComposer={vi.fn()}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onDownload={vi.fn()}
        onPublish={vi.fn()}
        onOpenInLibrary={vi.fn()}
        onToggleOutputSelection={vi.fn()}
        onNavigate={vi.fn()}
        onOpenPostModal={vi.fn()}
      />,
    );
    expect(screen.getByTestId('batch-outputs-grid')).toHaveClass('@container');
    const ready = screen.getByTestId('batch-output-card-ready');
    const failed = screen.getByTestId('batch-output-card-failed');
    expect(ready).toHaveClass('rounded-card');
    expect(ready).not.toHaveClass('rounded-2xl');
    expect(within(failed).getByRole('alert')).toHaveTextContent(
      'Output failed',
    );
    expect(within(ready).queryByRole('alert')).toBeNull();
    expect(
      within(ready).getByRole('button', { name: 'Publish' }),
    ).toBeVisible();
    expect(
      within(ready).queryByRole('button', { name: 'Download' }),
    ).toBeNull();
  });
});
