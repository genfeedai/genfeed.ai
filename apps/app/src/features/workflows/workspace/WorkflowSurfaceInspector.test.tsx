import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const service = vi.hoisted(() => ({
  get: vi.fn(),
  getExecution: vi.fn(),
  resumeExecution: vi.fn(),
  submitApproval: vi.fn(),
}));
const getService = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

import { WorkflowSurfaceInspector } from './WorkflowSurfaceInspector';

describe('WorkflowSurfaceInspector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getService.mockResolvedValue(service);
    service.get.mockResolvedValue({
      _id: 'workflow-1',
      createdAt: '2026-07-13T08:00:00.000Z',
      edgeStyle: 'bezier',
      edges: [],
      inputVariables: [
        {
          key: 'topic',
          label: 'Topic',
          required: true,
          type: 'text',
        },
      ],
      isScheduleEnabled: true,
      lifecycle: 'published',
      name: 'Launch brief',
      nodes: [],
      organization: 'organization-1',
      schedule: '0 9 * * *',
      timezone: 'Europe/Malta',
      updatedAt: '2026-07-13T08:00:00.000Z',
    });
    service.getExecution.mockResolvedValue({
      _id: 'run-1',
      createdAt: '2026-07-13T08:00:00.000Z',
      inputValues: { topic: 'Product launch' },
      metadata: {
        agentScope: {
          contextVersion: 4,
          source: 'agent',
          threadId: 'thread-1',
        },
        pendingApproval: {
          nodeId: 'review-1',
          requestedAt: '2026-07-13T08:01:00.000Z',
        },
        source: 'conversation',
      },
      nodeResults: [],
      progress: 60,
      status: 'waiting_approval',
      trigger: 'agent',
      updatedAt: '2026-07-13T08:01:00.000Z',
      workflow: 'workflow-1',
    });
    service.submitApproval.mockResolvedValue({ status: 'approved' });
    service.resumeExecution.mockResolvedValue({
      message: 'Partial execution started',
      runId: 'run-2',
      status: 'pending',
    });
  });

  it('shows run context and submits scoped approvals', async () => {
    render(
      <WorkflowSurfaceInspector
        contextVersion={4}
        pathname="/acme/moonrise/workflows/executions/run-1"
        searchParams={new URLSearchParams({ thread: 'thread-1' })}
        threadId="thread-1"
      />,
    );

    expect(await screen.findByText('Launch brief')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('Provided for this run')).toBeInTheDocument();
    expect(screen.getByText('conversation')).toBeInTheDocument();
    expect(screen.getByText('v4 · agent')).toBeInTheDocument();
    expect(screen.getByText('Review required')).toBeInTheDocument();
    expect(screen.getByText(/Enabled · 0 9 \* \* \*/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(service.submitApproval).toHaveBeenCalledWith(
        'workflow-1',
        'run-1',
        'review-1',
        true,
        undefined,
        { expectedContextVersion: 4, threadId: 'thread-1' },
      );
    });
  });

  it('resumes failed runs through the canonical scoped route', async () => {
    service.getExecution.mockResolvedValueOnce({
      _id: 'run-1',
      createdAt: '2026-07-13T08:00:00.000Z',
      metadata: { source: 'conversation' },
      nodeResults: [],
      progress: 100,
      status: 'failed',
      trigger: 'agent',
      updatedAt: '2026-07-13T08:01:00.000Z',
      workflow: 'workflow-1',
    });

    render(
      <WorkflowSurfaceInspector
        contextVersion={4}
        pathname="/acme/moonrise/workflows/executions/run-1"
        searchParams={new URLSearchParams({ thread: 'thread-1' })}
        threadId="thread-1"
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Resume failed run' }),
    );

    await waitFor(() => {
      expect(service.resumeExecution).toHaveBeenCalledWith(
        'workflow-1',
        'run-1',
        { expectedContextVersion: 4, threadId: 'thread-1' },
      );
      expect(router.push).toHaveBeenCalledWith(
        '/acme/moonrise/workflows/executions/run-2?thread=thread-1',
      );
    });
  });
});
