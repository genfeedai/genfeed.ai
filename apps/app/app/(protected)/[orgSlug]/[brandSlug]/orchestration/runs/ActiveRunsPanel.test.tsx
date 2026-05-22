import '@testing-library/jest-dom';
import { AgentExecutionStatus } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ActiveRunsPanel from './ActiveRunsPanel';

vi.mock('./AgentRunCard', () => ({
  default: ({
    onCancel,
    run,
  }: {
    onCancel?: (id: string) => void;
    run: { id: string; label: string };
  }) => (
    <article>
      <h3>{run.label}</h3>
      <button type="button" onClick={() => onCancel?.(run.id)}>
        cancel {run.id}
      </button>
    </article>
  ),
}));

const run = {
  createdAt: new Date().toISOString(),
  creditsUsed: 0,
  id: 'run-1',
  label: 'Active run',
  metadata: {},
  progress: 50,
  status: AgentExecutionStatus.RUNNING,
  toolCalls: [],
};

describe('ActiveRunsPanel', () => {
  it('renders nothing when no runs are active', () => {
    const { container } = render(<ActiveRunsPanel runs={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders active runs and forwards cancel callbacks', () => {
    const onCancel = vi.fn();

    render(
      <ActiveRunsPanel
        runs={[run, { ...run, id: 'run-2', label: 'Second run' }]}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Active Runs')).toBeVisible();
    expect(screen.getByText('(2)')).toBeVisible();
    expect(screen.getByText('Active run')).toBeVisible();
    expect(screen.getByText('Second run')).toBeVisible();

    fireEvent.click(screen.getByText('cancel run-2'));
    expect(onCancel).toHaveBeenCalledWith('run-2');
  });
});
