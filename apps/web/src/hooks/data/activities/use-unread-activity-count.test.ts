import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUnreadCount: vi.fn(),
}));
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
  }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn(), userId: 'user-1' }),
}));
vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: async () => 'token',
}));
vi.mock('@genfeedai/services/social/activities.service', () => ({
  ActivitiesService: {
    getInstance: () => ({ getUnreadCount: mocks.getUnreadCount }),
  },
}));

import { useUnreadActivityCount } from './use-unread-activity-count';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useUnreadActivityCount', () => {
  it('shows no dot until the count is loaded', () => {
    mocks.getUnreadCount.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useUnreadActivityCount(), { wrapper });
    expect(result.current).toBe(0);
  });

  it('uses the server count for the active brand', async () => {
    mocks.getUnreadCount.mockResolvedValue(7);
    const { result } = renderHook(() => useUnreadActivityCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(7));
    expect(mocks.getUnreadCount).toHaveBeenCalledWith(
      { brandId: 'brand-1' },
      expect.anything(),
    );
  });
});
