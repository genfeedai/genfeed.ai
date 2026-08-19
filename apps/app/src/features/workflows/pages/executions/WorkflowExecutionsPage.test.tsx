import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowExecutionsPage from './WorkflowExecutionsPage';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  href: vi.fn((path: string) => `/demo/FUDNEWS${path}`),
  list: vi.fn(),
  listExecutions: vi.fn(),
  orgId: 'org-demo' as string | null,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ orgId: mocks.orgId }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  AuthenticationTokenUnavailableError: class AuthenticationTokenUnavailableError extends Error {
    constructor() {
      super('Authentication token unavailable');
      this.name = 'AuthenticationTokenUnavailableError';
    }
  },
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
    mocks.orgId = 'org-demo';
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

  it('does not fetch or show an empty state before org identity is ready', async () => {
    mocks.orgId = null;

    render(<WorkflowExecutionsPage />);

    expect(screen.queryByText('No executions yet')).toBeNull();
    expect(mocks.listExecutions).not.toHaveBeenCalled();
  });

  it('renders execution history after the first org-scoped load', async () => {
    render(<WorkflowExecutionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Daily digest')).toBeInTheDocument();
    });
    expect(screen.queryByText('No executions yet')).toBeNull();
    expect(mocks.listExecutions).toHaveBeenCalledTimes(1);
  });
});
