// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReferralRewardsList from './referral-rewards-list';

const { getAdminRewardsMock, identityState } = vi.hoisted(() => ({
  getAdminRewardsMock: vi.fn(),
  identityState: {
    orgId: 'org_1',
    sessionId: 'session_1',
    userId: 'admin_1',
  },
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => identityState,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getAdminRewards: getAdminRewardsMock,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} type="button">
      Refresh
    </button>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    emptyLabel,
    items,
  }: {
    emptyLabel: string;
    items: unknown[];
  }) => <div>{items.length > 0 ? 'Reward rows' : emptyLabel}</div>,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    label,
    right,
  }: {
    children: ReactNode;
    label: string;
    right?: ReactNode;
  }) => (
    <section>
      <h1>{label}</h1>
      {right}
      {children}
    </section>
  ),
}));

describe('ReferralRewardsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdminRewardsMock.mockResolvedValue([]);
  });

  it('scopes its cache to the active identity and surfaces request failures', async () => {
    getAdminRewardsMock.mockRejectedValueOnce(new Error('API unavailable'));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ReferralRewardsList />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText('Referral rewards unavailable'),
    ).toBeVisible();
    expect(screen.queryByText('No referral rewards found')).toBeNull();
    expect(
      queryClient.getQueryCache().find({
        queryKey: ['admin-referral-rewards', 'admin_1', 'session_1', 'org_1'],
      }),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(getAdminRewardsMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText('No referral rewards found')).toBeVisible();
    });
  });
});
