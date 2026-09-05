import { AgentFailureReason } from '@genfeedai/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import pages from '../../../../../messages/en/pages.json';
import AgentFailuresPage from './content';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn(), getService: vi.fn() }));
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
  default: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@ui/overview/WorkspaceSurface', () => ({
  WorkspaceSurface: ({ children }: PropsWithChildren) => children,
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
    mocks.getService.mockResolvedValue({ listAdminFailures: mocks.list });
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
    expect(screen.getAllByText('Retry the run.')).toHaveLength(20);
    expect(screen.getAllByText('The provider timed out.')).toHaveLength(20);
    expect(
      screen.getAllByText('Provider request abc timed out after 60 seconds.'),
    ).toHaveLength(20);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith(
        undefined,
        20,
        expect.any(AbortSignal),
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
      ),
    );
  });
});
