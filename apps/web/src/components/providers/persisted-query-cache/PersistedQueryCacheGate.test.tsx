// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PersistedQueryCacheGate from '@/components/providers/persisted-query-cache/PersistedQueryCacheGate';
import {
  type PersistedQueryCacheRecord,
  type PersistedQueryCacheStorage,
  persistQueryMeta,
} from '@/lib/query-cache/persisted-query-cache';

const identity = vi.hoisted(() => ({
  organization: {
    confirmedOrganizationId: 'org-1' as string | null,
    isRouteConfirmed: true,
  },
  userId: 'user-1' as string | null,
}));

vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({ useRoutedOrganization: () => identity.organization }),
);
vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ userId: identity.userId }),
}));
vi.mock('@genfeedai/helpers/auth/auth.helper', () => ({
  getPlaywrightAuthState: () => null,
}));

function createStorage(initial: PersistedQueryCacheRecord | null) {
  const state = { record: initial };
  const storage: PersistedQueryCacheStorage = {
    clear: async () => {
      state.record = null;
    },
    read: async () => state.record,
    write: async (record) => {
      state.record = record;
    },
  };
  return { state, storage };
}

function Probe({ seen }: { seen: unknown[] }) {
  seen.push(useQueryClient().getQueryData(['inbox']));
  return <p>app</p>;
}

async function savedRecord(): Promise<PersistedQueryCacheRecord> {
  const source = new QueryClient();
  await source.fetchQuery({
    meta: persistQueryMeta(),
    queryFn: async () => ({ unreadCount: 4 }),
    queryKey: ['inbox'],
  });
  const { dehydrate } = await import('@tanstack/react-query');
  return {
    buster: 'development',
    organizationId: 'org-1',
    savedAt: Date.now(),
    state: dehydrate(source),
    userId: 'user-1',
  };
}

describe('PersistedQueryCacheGate', () => {
  beforeEach(() => {
    identity.userId = 'user-1';
    identity.organization = {
      confirmedOrganizationId: 'org-1',
      isRouteConfirmed: true,
    };
  });

  it('holds the tree until the stored reads are back, then mounts it with them', async () => {
    const { storage } = createStorage(await savedRecord());
    const queryClient = new QueryClient();
    const seen: unknown[] = [];

    render(
      <QueryClientProvider client={queryClient}>
        <PersistedQueryCacheGate fallback={<p>frame</p>} storage={storage}>
          <Probe seen={seen} />
        </PersistedQueryCacheGate>
      </QueryClientProvider>,
    );

    expect(screen.getByText('frame')).toBeTruthy();
    await screen.findByText('app');
    expect(seen[0]).toEqual({ unreadCount: 4 });
  });

  it('mounts the tree with nothing restored when another user owns the record', async () => {
    identity.userId = 'user-2';
    const { state, storage } = createStorage(await savedRecord());
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <PersistedQueryCacheGate storage={storage}>
          <p>app</p>
        </PersistedQueryCacheGate>
      </QueryClientProvider>,
    );

    await screen.findByText('app');
    expect(queryClient.getQueryData(['inbox'])).toBeUndefined();
    await waitFor(() => expect(state.record).toBeNull());
  });

  it('does not read the store before the organization is confirmed', async () => {
    identity.organization = {
      confirmedOrganizationId: null,
      isRouteConfirmed: false,
    };
    const { state, storage } = createStorage(await savedRecord());
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <PersistedQueryCacheGate storage={storage}>
          <p>app</p>
        </PersistedQueryCacheGate>
      </QueryClientProvider>,
    );

    await screen.findByText('app');
    expect(queryClient.getQueryData(['inbox'])).toBeUndefined();
    expect(state.record).not.toBeNull();
  });

  it('keeps the tree mounted when an organization switch confirms a new scope', async () => {
    const { storage } = createStorage(await savedRecord());
    const queryClient = new QueryClient();
    const tree = (
      <QueryClientProvider client={queryClient}>
        <PersistedQueryCacheGate fallback={<p>frame</p>} storage={storage}>
          <p>app</p>
        </PersistedQueryCacheGate>
      </QueryClientProvider>
    );

    const { rerender } = render(tree);
    const app = await screen.findByText('app');

    // The member's own switch: nothing confirmed, then the new organization.
    identity.organization = {
      confirmedOrganizationId: null,
      isRouteConfirmed: false,
    };
    rerender(tree);
    identity.organization = {
      confirmedOrganizationId: 'org-2',
      isRouteConfirmed: true,
    };
    rerender(tree);

    expect(screen.queryByText('frame')).toBeNull();
    expect(screen.getByText('app')).toBe(app);
  });
});
