import '@testing-library/jest-dom/vitest';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ActiveRunsPanel from './ActiveRunsPanel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('./WorkflowExecutionCard', () => ({
  default: ({
    execution,
    onCancel,
  }: {
    execution: { id: string; workflow?: { label: string } };
    onCancel?: (id: string) => void;
  }) => (
    <article>
      <h3>{execution.workflow?.label}</h3>
      <button type="button" onClick={() => onCancel?.(execution.id)}>
        cancel {execution.id}
      </button>
    </article>
  ),
}));

const execution = {
  createdAt: new Date().toISOString(),
  creditsUsed: 0,
  id: 'execution-1',
  inputValues: {},
  metadata: {},
  nodeResults: [],
  organizationId: 'organization-1',
  progress: 50,
  status: WorkflowExecutionStatus.RUNNING,
  trigger: WorkflowExecutionTrigger.MANUAL,
  updatedAt: new Date().toISOString(),
  userId: 'user-1',
  workflow: { id: 'workflow-1', label: 'Active workflow' },
  workflowId: 'workflow-1',
};

describe('ActiveRunsPanel', () => {
  it('renders nothing when no runs are active', () => {
    const { container } = render(<ActiveRunsPanel executions={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders active runs and forwards cancel callbacks', () => {
    const onCancel = vi.fn();

    render(
      <ActiveRunsPanel
        executions={[
          execution,
          {
            ...execution,
            id: 'execution-2',
            workflow: { id: 'workflow-2', label: 'Second workflow' },
            workflowId: 'workflow-2',
          },
        ]}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Active Runs')).toBeVisible();
    expect(screen.getByText('(2)')).toBeVisible();
    expect(screen.getByText('Active workflow')).toBeVisible();
    expect(screen.getByText('Second workflow')).toBeVisible();

    fireEvent.click(screen.getByText('cancel execution-2'));
    expect(onCancel).toHaveBeenCalledWith('execution-2');
  });
});
