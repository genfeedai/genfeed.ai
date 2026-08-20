import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowExecutionsPage from './WorkflowExecutionsPage';

const mocks = vi.hoisted(() => ({
  AuthenticationTokenUnavailableError: class AuthenticationTokenUnavailableError extends Error {
    constructor() {
      super('Authentication token unavailable');
      this.name = 'AuthenticationTokenUnavailableError';
    }
  },
  getService: vi.fn(),
  href: vi.fn((path: string) => `/demo/FUDNEWS${path}`),
  isReady: true,
  list: vi.fn(),
  listExecutions: vi.fn(),
  organizationId: 'org-demo' as string,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    isReady: mocks.isReady,
    organizationId: mocks.organizationId,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  AuthenticationTokenUnavailableError:
    mocks.AuthenticationTokenUnavailableError,
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

vi.mock('@/components/ui/client-formatted-date', () => ({
  ClientFormattedDate: ({ value }: { value?: string }) => (
    <span>{value ?? ''}</span>
  ),
}));

describe('WorkflowExecutionsPage', () => {
  beforeEach(() => {
    mocks.isReady = true;
    mocks.organizationId = 'org-demo';
    mocks.list.mockResolvedValue([{ id: 'wf-1', label: 'Daily digest' }]);
    mocks.listExecutions.mockResolvedValue([
      {
        createdAt: '2026-08-19T09:00:00.000Z',
        id: 'exec-1',
        progress: 100,
        startedAt: '2026-08-19T09:00:00.000Z',
        status: 'completed',
        workflowId: 'wf-1',
      },
    ]);
    mocks.getService.mockResolvedValue({
      list: mocks.list,
      listExecutions: mocks.listExecutions,
    });
  });

  it('does not fetch or show an empty state before brand scope is ready', async () => {
    mocks.isReady = false;
    mocks.organizationId = '';

    render(<WorkflowExecutionsPage />);

    expect(screen.queryByText('No executions yet')).toBeNull();
    expect(screen.queryByText('Daily digest')).toBeNull();
    expect(mocks.listExecutions).not.toHaveBeenCalled();
  });

  it('renders execution history from the URL brand org even when Better Auth orgId is unset', async () => {
    render(<WorkflowExecutionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Daily digest')).toBeInTheDocument();
    });
    expect(screen.queryByText('No executions yet')).toBeNull();
    expect(mocks.listExecutions).toHaveBeenCalledTimes(1);
  });

  it('clears the first-load skeleton when the auth token is not ready', async () => {
    mocks.getService.mockRejectedValue(
      new mocks.AuthenticationTokenUnavailableError(),
    );

    render(<WorkflowExecutionsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Authentication token unavailable'),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(mocks.listExecutions).not.toHaveBeenCalled();
  });
});
