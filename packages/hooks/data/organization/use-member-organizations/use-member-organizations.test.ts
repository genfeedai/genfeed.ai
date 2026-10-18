import type { MemberOrganizationOption } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import {
  MEMBER_ORGANIZATIONS_QUERY_KEY,
  sortMemberOrganizations,
  useMemberOrganizations,
} from '@hooks/data/organization/use-member-organizations/use-member-organizations';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  apiEndpoint: 'https://api-a.example.test/v1',
  dispatchedTokens: [] as string[],
  getAllOrganizations: vi.fn(),
  getMyOrganizations: vi.fn<() => Promise<MemberOrganizationOption[]>>(),
  getToken: vi.fn<() => Promise<string | null>>(),
  identity: { orgId: 'org-a', sessionId: 'session-a', userId: 'actor-a' },
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ ...fixture.identity, getToken: fixture.getToken }),
}));
vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    get apiEndpoint() {
      return fixture.apiEndpoint;
    },
  },
}));
vi.mock('@genfeedai/services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: (token: string) => ({
      getAllOrganizations: fixture.getAllOrganizations,
      getMyOrganizations: () => {
        fixture.dispatchedTokens.push(token);
        return fixture.getMyOrganizations();
      },
    }),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const clients: QueryClient[] = [];
function createHarness() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 300_000, retry: false, staleTime: 30_000 },
    },
  });
  clients.push(client);
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  }
  return { client, wrapper };
}
const oldRows = [{ id: 'private-a', label: 'Private actor A' }];
const newRows = [{ id: 'private-b', label: 'Private actor B' }];

beforeEach(() => {
  vi.resetAllMocks();
  fixture.apiEndpoint = 'https://api-a.example.test/v1';
  fixture.identity = {
    orgId: 'org-a',
    sessionId: 'session-a',
    userId: 'actor-a',
  };
  fixture.dispatchedTokens.length = 0;
  fixture.getToken.mockImplementation(async () =>
    [fixture.identity.userId, fixture.identity.sessionId].join(':'),
  );
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
});

describe('useMemberOrganizations', () => {
  it('lists only member organizations, alphabetically', async () => {
    fixture.getMyOrganizations.mockResolvedValue([
      { id: 'b', label: 'shipshitshow' },
      { id: 'a', label: 'Genfeed' },
      { id: 'c', label: 'acme' },
    ]);
    const { result } = renderHook(useMemberOrganizations, createHarness());
    await waitFor(() => expect(result.current.organizations).toHaveLength(3));
    expect(result.current.organizations.map((org) => org.label)).toEqual([
      'acme',
      'Genfeed',
      'shipshitshow',
    ]);
    expect(fixture.getAllOrganizations).not.toHaveBeenCalled();
    expect(Object.keys(result.current).sort()).toEqual([
      'isLoading',
      'organizations',
    ]);
  });

  it('sorts case-insensitively without mutating the input', () => {
    const input = [
      { id: '2', label: 'beta' },
      { id: '1', label: 'Alpha' },
    ];
    expect(sortMemberOrganizations(input).map((org) => org.id)).toEqual([
      '1',
      '2',
    ]);
    expect(input[0].id).toBe('2');
  });

  it.each(['actor', 'session', 'API'] as const)(
    'hides warm prior-owner rows immediately after a %s change',
    async (change) => {
      const next = deferred<MemberOrganizationOption[]>();
      fixture.getMyOrganizations
        .mockResolvedValueOnce(oldRows)
        .mockReturnValueOnce(next.promise);
      const { result, rerender } = renderHook(
        useMemberOrganizations,
        createHarness(),
      );
      await waitFor(() =>
        expect(result.current.organizations).toEqual(oldRows),
      );
      if (change === 'actor') fixture.identity.userId = 'actor-b';
      if (change === 'session') fixture.identity.sessionId = 'session-b';
      if (change === 'API')
        fixture.apiEndpoint = 'https://api-b.example.test/v1';
      rerender();
      expect(result.current).toEqual({ isLoading: true, organizations: [] });
      await waitFor(() =>
        expect(fixture.getMyOrganizations).toHaveBeenCalledTimes(2),
      );
      await act(async () => next.resolve(newRows));
      await waitFor(() =>
        expect(result.current.organizations).toEqual(newRows),
      );
    },
  );

  it.each(['replacement', 'unmount'] as const)(
    'does not dispatch a cancelled token acquisition after %s',
    async (transition) => {
      const token = deferred<string | null>();
      fixture.getToken.mockReturnValueOnce(token.promise);
      fixture.getMyOrganizations.mockResolvedValue(newRows);
      const { rerender, unmount } = renderHook(
        useMemberOrganizations,
        createHarness(),
      );
      await waitFor(() => expect(fixture.getToken).toHaveBeenCalledTimes(1));
      if (transition === 'replacement') {
        fixture.identity.userId = 'actor-b';
        fixture.identity.sessionId = 'session-b';
        rerender();
      } else {
        unmount();
      }
      await act(async () => token.resolve('stale-fixture-token'));
      expect(fixture.dispatchedTokens).not.toContain('stale-fixture-token');
      if (transition === 'replacement') {
        await waitFor(() =>
          expect(fixture.dispatchedTokens).toContain('actor-b:session-b'),
        );
      }
    },
  );

  it.each(['success', 'failure'] as const)(
    'preserves current rows after late prior-owner %s',
    async (completion) => {
      const previous = deferred<MemberOrganizationOption[]>();
      fixture.getMyOrganizations
        .mockReturnValueOnce(previous.promise)
        .mockResolvedValueOnce(newRows);
      const { result, rerender } = renderHook(
        useMemberOrganizations,
        createHarness(),
      );
      await waitFor(() =>
        expect(fixture.getMyOrganizations).toHaveBeenCalledTimes(1),
      );
      fixture.identity.userId = 'actor-b';
      fixture.identity.sessionId = 'session-b';
      rerender();
      await waitFor(() =>
        expect(result.current.organizations).toEqual(newRows),
      );
      await act(async () => {
        if (completion === 'success') previous.resolve(oldRows);
        else previous.reject(new Error('Old owner read failed'));
      });
      expect(result.current).toEqual({
        isLoading: false,
        organizations: newRows,
      });
    },
  );

  it('does not revive a cancelled acquisition when the owner returns A to B to A', async () => {
    const oldToken = deferred<string | null>();
    fixture.getToken.mockReturnValueOnce(oldToken.promise);
    fixture.getMyOrganizations
      .mockResolvedValueOnce(newRows)
      .mockResolvedValueOnce(oldRows);
    const { result, rerender } = renderHook(
      useMemberOrganizations,
      createHarness(),
    );
    await waitFor(() => expect(fixture.getToken).toHaveBeenCalledTimes(1));
    fixture.identity.userId = 'actor-b';
    fixture.identity.sessionId = 'session-b';
    rerender();
    await waitFor(() => expect(result.current.organizations).toEqual(newRows));
    fixture.identity.userId = 'actor-a';
    fixture.identity.sessionId = 'session-a';
    rerender();
    expect(result.current.organizations).toEqual([]);
    await waitFor(() => expect(result.current.organizations).toEqual(oldRows));
    await act(async () => oldToken.resolve('stale-fixture-token'));
    expect(fixture.dispatchedTokens).toEqual([
      'actor-b:session-b',
      'actor-a:session-a',
    ]);
    expect(result.current.organizations).toEqual(oldRows);
  });

  it('reuses the same owner cache across remounts', async () => {
    fixture.getMyOrganizations.mockResolvedValue(oldRows);
    const harness = createHarness();
    const first = renderHook(useMemberOrganizations, harness);
    await waitFor(() =>
      expect(first.result.current.organizations).toEqual(oldRows),
    );
    first.unmount();
    const second = renderHook(useMemberOrganizations, harness);
    expect(second.result.current).toEqual({
      isLoading: false,
      organizations: oldRows,
    });
    expect(fixture.getMyOrganizations).toHaveBeenCalledTimes(1);
  });

  it('keeps actor-wide membership cached when only the active organization changes', async () => {
    fixture.getMyOrganizations.mockResolvedValue(oldRows);
    const { result, rerender } = renderHook(
      useMemberOrganizations,
      createHarness(),
    );
    await waitFor(() => expect(result.current.organizations).toEqual(oldRows));
    fixture.identity.orgId = 'org-b';
    rerender();
    expect(result.current.organizations).toEqual(oldRows);
    expect(fixture.getMyOrganizations).toHaveBeenCalledTimes(1);
  });

  it('preserves prefix invalidation for all owned variants and refetches the active owner', async () => {
    fixture.getMyOrganizations
      .mockResolvedValueOnce(oldRows)
      .mockResolvedValue(newRows);
    const harness = createHarness();
    const { result, rerender } = renderHook(useMemberOrganizations, harness);
    await waitFor(() => expect(result.current.organizations).toEqual(oldRows));
    fixture.identity.userId = 'actor-b';
    fixture.identity.sessionId = 'session-b';
    rerender();
    await waitFor(() => expect(result.current.organizations).toEqual(newRows));
    expect(MEMBER_ORGANIZATIONS_QUERY_KEY).toEqual(['member-organizations']);
    const variants = harness.client.getQueryCache().findAll({
      queryKey: MEMBER_ORGANIZATIONS_QUERY_KEY,
    });
    expect(variants).toHaveLength(2);
    await act(async () => {
      await harness.client.invalidateQueries({
        queryKey: MEMBER_ORGANIZATIONS_QUERY_KEY,
      });
    });
    expect(fixture.getMyOrganizations).toHaveBeenCalledTimes(3);
    expect(
      variants.find((query) => !query.isActive())?.state.isInvalidated,
    ).toBe(true);
    expect(result.current.organizations).toEqual(newRows);
  });

  it('keeps the existing empty result after a current-owner read fails', async () => {
    fixture.getMyOrganizations.mockRejectedValue(
      new Error('Membership failed'),
    );
    const { result } = renderHook(useMemberOrganizations, createHarness());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.organizations).toEqual([]);
  });
});
