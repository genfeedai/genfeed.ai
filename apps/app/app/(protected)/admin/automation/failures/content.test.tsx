import { AgentFailureReason } from '@genfeedai/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import pages from '../../../../../messages/en/pages';
import AgentFailuresPage from './content';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  list: vi.fn(),
  notifyError: vi.fn(),
  setResolved: vi.fn(),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    leading,
  }: PropsWithChildren<{ leading?: ReactNode }>) => (
    <>
      {leading}
      {children}
    </>
  ),
}));
vi.mock('@ui/overview/WorkspaceSurface', () => ({
  WorkspaceSurface: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mocks.notifyError }),
  },
}));
vi.mock('@ui/loading/fallback/LazyLoadingFallback', () => ({
  default: () => 'Loading failures',
}));

describe('AgentFailuresPage', () => {
  it('provides an English label for every failure reason', () => {
    expect(Object.keys(pages.agentFailures.reasons).toSorted()).toEqual(
      Object.values(AgentFailureReason).toSorted(),
    );
    for (const label of Object.values(pages.agentFailures.reasons)) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    mocks.getService.mockResolvedValue({
      listAdminFailures: mocks.list,
      setAdminFailureResolved: mocks.setResolved,
    });
    mocks.list.mockResolvedValue([]);
  });

  it('renders an empty feed and aborts requests on unmount', async () => {
    const { unmount } = render(<AgentFailuresPage />);
    expect(
      await screen.findByText('No agent failures found'),
    ).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith(
      undefined,
      0,
      expect.any(AbortSignal),
      'open',
    );
    const signal = mocks.list.mock.calls[0][2];
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('supports retry after a failed request', async () => {
    mocks.list.mockRejectedValueOnce(new Error('offline'));
    render(<AgentFailuresPage />);
    expect(
      await screen.findByText('Agent failures could not be loaded.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('No agent failures found'),
    ).toBeInTheDocument();
  });

  it('shows failure recovery and paginates across organizations', async () => {
    mocks.list.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, index) => ({
        id: `run-${index}`,
        organizationId: `org-${index}`,
        workflowId: 'workflow-1',
        createdAt: '2026-09-01T12:00:00Z',
        failureReason: 'TIMEOUT',
        error: 'Provider request abc timed out after 60 seconds.',
        failure: {
          summary: 'The provider timed out.',
          recovery: 'Retry the run.',
        },
      })),
    );
    render(<AgentFailuresPage />);
    expect(await screen.findByText('org-19')).toBeInTheDocument();
    expect(
      screen.getAllByText('Provider request abc timed out after 60 seconds.'),
    ).toHaveLength(20);
    // 20 status badges plus the selected status filter.
    expect(screen.getAllByText('Open')).toHaveLength(21);
    expect(screen.queryByText('Retry the run.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith(
        undefined,
        20,
        expect.any(AbortSignal),
        'open',
      ),
    );
    expect(
      await screen.findByText('No agent failures found'),
    ).toBeInTheDocument();
  });
  it('resets pagination when filtering by reason', async () => {
    mocks.list.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, index) => ({
        id: `run-${index}`,
        organizationId: 'org-1',
        workflowId: 'workflow-1',
        createdAt: '2026-09-01T12:00:00Z',
      })),
    );
    const user = userEvent.setup();
    render(<AgentFailuresPage />);
    await screen.findByText('run-19');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('No agent failures found');
    await user.click(screen.getByRole('combobox', { name: 'Failure reason' }));
    await user.click(screen.getByRole('option', { name: 'Timeout' }));
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith(
        'TIMEOUT',
        0,
        expect.any(AbortSignal),
        'open',
      ),
    );
  });

  it('shows the organization name and keeps the full error behind a toggle', async () => {
    mocks.list.mockResolvedValueOnce([
      {
        id: 'run-1',
        organization: { id: 'org-1', label: 'Acme Studio' },
        organizationId: 'org-1',
        workflowId: 'workflow-1',
        createdAt: '2026-09-01T12:00:00Z',
        error: 'Nodes failed: prepare-turn: request.threadId is required',
        failure: { recovery: 'Retry the run.' },
      },
    ]);
    const user = userEvent.setup();
    render(<AgentFailuresPage />);
    expect(await screen.findByText('Acme Studio')).toBeInTheDocument();
    expect(
      screen.getByText('request.threadId is required'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Full error')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByText('Full error')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nodes failed: prepare-turn: request.threadId is required',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Retry the run.')).toBeInTheDocument();
  });

  it('marks a failure resolved and drops it from the open list', async () => {
    mocks.list.mockResolvedValueOnce([
      {
        id: 'run-1',
        organizationId: 'org-1',
        workflowId: 'workflow-1',
        createdAt: '2026-09-01T12:00:00Z',
      },
    ]);
    mocks.setResolved.mockResolvedValue({
      id: 'run-1',
      failureResolvedAt: '2026-09-02T12:00:00Z',
    });
    const user = userEvent.setup();
    render(<AgentFailuresPage />);
    await screen.findByText('run-1');
    await user.click(screen.getByRole('button', { name: 'Mark resolved' }));
    await waitFor(() =>
      expect(mocks.setResolved).toHaveBeenCalledWith('run-1', true),
    );
    expect(
      await screen.findByText('No agent failures found'),
    ).toBeInTheDocument();
  });

  it('reports a failed resolve and keeps the row', async () => {
    mocks.list.mockResolvedValueOnce([
      {
        id: 'run-1',
        organizationId: 'org-1',
        workflowId: 'workflow-1',
        createdAt: '2026-09-01T12:00:00Z',
      },
    ]);
    mocks.setResolved.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<AgentFailuresPage />);
    await screen.findByText('run-1');
    await user.click(screen.getByRole('button', { name: 'Mark resolved' }));
    await waitFor(() =>
      expect(mocks.notifyError).toHaveBeenCalledWith(
        'Could not update this failure.',
      ),
    );
    expect(screen.getByText('run-1')).toBeInTheDocument();
  });

  it('opens a prefilled GitHub issue for a failure', async () => {
    mocks.list.mockResolvedValueOnce([
      {
        id: 'run-1',
        organization: { id: 'org-1', label: 'Acme Studio' },
        organizationId: 'org-1',
        workflowId: 'workflow-1',
        createdAt: '2026-09-01T12:00:00Z',
        error: 'Nodes failed: prepare-turn: request.threadId is required',
      },
    ]);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    render(<AgentFailuresPage />);
    await screen.findByText('run-1');
    await user.click(
      screen.getByRole('button', { name: 'Create GitHub issue' }),
    );
    const url = new URL(open.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/genfeedai/genfeed.ai/issues/new');
    expect(url.searchParams.get('body')).toContain('Acme Studio');
    expect(open.mock.calls[0][2]).toBe('noopener,noreferrer');
    open.mockRestore();
  });

  it('lists resolved failures when the status filter changes', async () => {
    const user = userEvent.setup();
    render(<AgentFailuresPage />);
    await screen.findByText('No agent failures found');
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Resolved' }));
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith(
        undefined,
        0,
        expect.any(AbortSignal),
        'resolved',
      ),
    );
  });
});
