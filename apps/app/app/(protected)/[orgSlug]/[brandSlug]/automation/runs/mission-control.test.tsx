import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MissionControl from './mission-control';

const state = vi.hoisted(() => ({ isError: false, refresh: vi.fn() }));
vi.mock('@hooks/data/workflow-executions/use-workflow-executions', () => ({
  useWorkflowExecutions: () => ({
    cancelExecution: vi.fn(),
    executions: [],
    isLoading: false,
    isError: state.isError,
    refresh: state.refresh,
    stats: { total: 0 },
  }),
}));
vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    label,
    right,
    children,
  }: {
    label: string;
    right: ReactNode;
    children: ReactNode;
  }) => (
    <main>
      <h1>{label}</h1>
      <header>{right}</header>
      {children}
    </main>
  ),
}));
vi.mock('./RunStatsStrip', () => ({
  default: () => <div>Execution statistics</div>,
}));
vi.mock('./ActiveRunsPanel', () => ({ default: () => null }));

describe('MissionControl', () => {
  beforeEach(() => {
    state.isError = false;
    state.refresh.mockReset();
  });
  it('keeps header tools available and offers retry without an empty-list message on failure', () => {
    state.isError = true;
    render(<MissionControl />);
    expect(
      screen.getByRole('heading', { name: 'Workflow Executions' }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByPlaceholderText('Search workflow executions')
        .closest('header'),
    ).not.toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Workflow executions could not be loaded.',
    );
    expect(screen.queryByText('No workflow executions yet.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.refresh).toHaveBeenCalledOnce();
  });
  it('distinguishes a filtered empty result and lets the user clear it', () => {
    render(<MissionControl />);
    fireEvent.change(
      screen.getByPlaceholderText('Search workflow executions'),
      { target: { value: 'missing' } },
    );
    expect(
      screen.getByText('No workflow executions match your search.'),
    ).toBeInTheDocument();
    const clearButtons = screen.getAllByRole('button', {
      name: 'Clear search',
    });
    fireEvent.click(clearButtons[clearButtons.length - 1]);
    expect(
      screen.getByPlaceholderText('Search workflow executions'),
    ).toHaveValue('');
    expect(screen.getByText('No workflow executions yet.')).toBeInTheDocument();
  });
});
