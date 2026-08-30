import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExecutionDetailPage from './ExecutionDetailPage';

const mocks = vi.hoisted(() => ({
  getExecution: vi.fn(),
  getService: vi.fn(),
  href: vi.fn((path: string) => `/demo/FUDNEWS${path}`),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children?: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

describe('ExecutionDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getExecution.mockResolvedValue({
      completedAt: '2026-08-19T09:05:00.000Z',
      createdAt: '2026-08-19T09:00:00.000Z',
      creditsUsed: 3,
      id: 'exec-1',
      nodeResults: [],
      startedAt: '2026-08-19T09:00:00.000Z',
      status: 'completed',
      workflow: { id: 'wf-1', label: 'Daily digest' },
      workflowId: 'wf-1',
    });
    mocks.getService.mockResolvedValue({
      getExecution: mocks.getExecution,
    });
  });

  it('keeps the all-executions link mounted while the run is still loading', async () => {
    let resolveExecution: (value: unknown) => void = () => {};
    mocks.getExecution.mockReturnValue(
      new Promise((resolve) => {
        resolveExecution = resolve;
      }),
    );

    render(<ExecutionDetailPage executionId="exec-1" />);

    expect(
      screen.getByRole('link', { name: 'All executions' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('execution-detail-loading')).toBeInTheDocument();

    resolveExecution({
      completedAt: '2026-08-19T09:05:00.000Z',
      createdAt: '2026-08-19T09:00:00.000Z',
      creditsUsed: 3,
      id: 'exec-1',
      nodeResults: [],
      startedAt: '2026-08-19T09:00:00.000Z',
      status: 'completed',
      workflow: { id: 'wf-1', label: 'Daily digest' },
      workflowId: 'wf-1',
    });
    await waitFor(() => {
      expect(screen.queryByTestId('execution-detail-loading')).toBeNull();
    });
  });

  it('renders the execution header once the run has loaded', async () => {
    render(<ExecutionDetailPage executionId="exec-1" />);

    await waitFor(() => {
      expect(
        screen.getByText('Daily digest execution exec-1'),
      ).toBeInTheDocument();
    });
    expect(
      screen.getAllByRole('link', { name: 'All executions' }).length,
    ).toBeGreaterThan(0);
  });
});
