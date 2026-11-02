import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * The signed-in viewer `useAuthedQuery` reads in specs. Mock the identity hook
 * with it:
 *
 *   vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
 *     useAuthIdentity: (await import('@app-tests/query-client.harness')).useTestViewer,
 *   }));
 */
export const TEST_VIEWER = {
  getToken: async () => 'test-token',
  orgId: 'org-1',
  sessionId: 'session-1',
  userId: 'user-1',
};

export function useTestViewer() {
  return TEST_VIEWER;
}

/** No retries, so a failed read shows its error state straight away. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
}

let activeClient: QueryClient = createTestQueryClient();

function QueryClientTestWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={activeClient}>{children}</QueryClientProvider>
  );
}

/**
 * A `wrapper` for `render` / `renderHook` bound to `client`; `rerender` and
 * later renders with the same client share its cache.
 */
export function queryClientWrapper(
  client: QueryClient = createTestQueryClient(),
) {
  activeClient = client;
  return QueryClientTestWrapper;
}
