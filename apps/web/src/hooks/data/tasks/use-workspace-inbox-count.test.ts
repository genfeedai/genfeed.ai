import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findInboxReadState: vi.fn(),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'workspace-a' }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: vi.fn(),
    orgId: 'org-1',
    userId: 'user-1',
  }),
}));
vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: async () => 'token',
}));
vi.mock('@services/management/tasks.service', () => ({
  TasksService: {
    getInstance: () => ({ findInboxReadState: mocks.findInboxReadState }),
  },
}));

import { useWorkspaceInboxCount } from './use-workspace-inbox-count';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useWorkspaceInboxCount', () => {
  it('shows no indicator until the count is loaded', () => {
    mocks.findInboxReadState.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useWorkspaceInboxCount(), { wrapper });
    expect(result.current).toBe(0);
  });

  it('uses the server count and asks for it without the receipt list', async () => {
    mocks.findInboxReadState.mockResolvedValue({ reads: [], unreadCount: 52 });
    const { result } = renderHook(() => useWorkspaceInboxCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(52));
    expect(mocks.findInboxReadState).toHaveBeenCalledWith(expect.anything(), {
      countOnly: true,
    });
  });
});
