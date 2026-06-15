import '@testing-library/jest-dom/vitest';
import { AgentExecutionStatus } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentRunCard from './AgentRunCard';

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children?: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

const NOW = Date.now();

const baseRun = {
  completedAt: null,
  createdAt: new Date(NOW - 30_000).toISOString(),
  creditsUsed: 0,
  durationMs: undefined,
  error: null,
  id: 'run-1',
  label: 'Generate launch content',
  metadata: {},
  progress: 35,
  startedAt: null,
  status: AgentExecutionStatus.PENDING,
  toolCalls: [],
};

describe('AgentRunCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders active run state, model routing, grouped tools, progress, and cancel', () => {
    const onCancel = vi.fn();

    render(
      <AgentRunCard
        run={{
          ...baseRun,
          creditsUsed: 12,
          durationMs: 65_000,
          metadata: {
            actualModel: 'gpt-5.4',
            requestedModel: 'fast-route',
            routingPolicy: 'balanced',
          },
          startedAt: new Date(NOW - 90 * 60_000).toISOString(),
          status: AgentExecutionStatus.RUNNING,
          toolCalls: [
            { toolName: 'search' },
            { toolName: 'search' },
            { toolName: 'generateImage' },
          ],
        }}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Running')).toBeVisible();
    expect(screen.getByText('Generate launch content')).toBeVisible();
    expect(screen.getByText('12 credits')).toBeVisible();
    expect(screen.getByText('1h ago')).toBeVisible();
    expect(screen.getByText('Model: gpt-5.4 via fast-route')).toBeVisible();
    expect(screen.getByText('Routing: balanced')).toBeVisible();
    expect(screen.getByText('search')).toBeVisible();
    expect(screen.getByText('x2')).toBeVisible();
    expect(screen.getByText('generateImage')).toBeVisible();
    expect(screen.getByText('1m 5s')).toBeVisible();
    expect(document.querySelector('.bg-blue-500')).toHaveStyle({
      width: '35%',
    });

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledWith('run-1');
  });

  it('renders completed, failed, cancelled, and unknown statuses with duration fallbacks', () => {
    const { rerender } = render(
      <AgentRunCard
        run={{
          ...baseRun,
          completedAt: new Date(NOW - 3 * 24 * 60 * 60_000).toISOString(),
          durationMs: 750,
          metadata: { requestedModel: 'claude-sonnet' },
          status: AgentExecutionStatus.COMPLETED,
        }}
      />,
    );

    expect(screen.getByText('Completed')).toBeVisible();
    expect(screen.getByText('3d ago')).toBeVisible();
    expect(screen.getByText('Model: claude-sonnet')).toBeVisible();
    expect(screen.getByText('750ms')).toBeVisible();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();

    rerender(
      <AgentRunCard
        run={{
          ...baseRun,
          durationMs: 12_000,
          error: 'Provider failed',
          status: AgentExecutionStatus.FAILED,
        }}
      />,
    );
    expect(screen.getByText('Failed')).toBeVisible();
    expect(screen.getByText('12s')).toBeVisible();
    expect(screen.getByText('Provider failed')).toBeVisible();

    rerender(
      <AgentRunCard
        run={{
          ...baseRun,
          status: AgentExecutionStatus.CANCELLED,
        }}
      />,
    );
    expect(screen.getByText('Cancelled')).toBeVisible();

    rerender(<AgentRunCard run={{ ...baseRun, status: 'custom-status' }} />);
    expect(screen.getByText('Pending')).toBeVisible();
  });
});
