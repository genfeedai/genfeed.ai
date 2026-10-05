// @vitest-environment jsdom
'use client';

import {
  type UserContextValue,
  UserProvider,
  useCurrentUser,
  useOptionalUser,
} from '@genfeedai/contexts/user/user-context/user-context';
import type { IUser } from '@genfeedai/contracts/interfaces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthIdentityMock = vi.fn();
const useAuthUserMock = vi.fn();
const findMeMock = vi.fn();
const patchSettingsMock = vi.fn();
const bootstrapMock = vi.fn();
const loggerWarnMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => useAuthIdentityMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: () => useAuthUserMock(),
}));

vi.mock('@genfeedai/contexts/user/internal/context-authed-service', () => ({
  useContextAuthedService: () => () =>
    Promise.resolve({ findMe: findMeMock, patchSettings: patchSettingsMock }),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  getPlaywrightAuthState: vi.fn(() => null),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: (...args: unknown[]) => loggerErrorMock(...args),
    info: vi.fn(),
    warn: (...args: unknown[]) => loggerWarnMock(...args),
  },
}));

vi.mock('@providers/protected-bootstrap/client-protected-bootstrap', () => ({
  clearClientProtectedBootstrapCache: vi.fn(),
  loadClientProtectedBootstrap: (...args: unknown[]) => bootstrapMock(...args),
}));

let contextValue: UserContextValue;

function Consumer(): null {
  contextValue = useCurrentUser();
  return null;
}

function renderWithProvider(providerProps?: {
  hasInitialBootstrap?: boolean;
  initialCurrentUser?: IUser | null;
  initialMemberRole?: string | null;
  initialOrganizationId?: string;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 0, retry: false, staleTime: 0 },
    },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <UserProvider {...providerProps}>
        <Consumer />
      </UserProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe('UserProvider behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthIdentityMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org_1',
      userId: 'user_1',
    });
    useAuthUserMock.mockReturnValue({
      user: {
        id: 'user_1',
        updatedAt: new Date('2026-03-17T10:00:00.000Z'),
      },
    });
    bootstrapMock.mockResolvedValue(null);
    findMeMock.mockResolvedValue({
      id: 'user_1',
      settings: { isFirstLogin: true },
    });
    patchSettingsMock.mockResolvedValue(undefined);
  });

  it('exposes the active membership role from the same bootstrap request', async () => {
    bootstrapMock.mockResolvedValue({
      currentUser: { id: 'user_1' },
      accessState: { memberRole: 'owner' },
    });
    renderWithProvider();
    expect(contextValue.memberRole).toBeUndefined();
    await waitFor(() => expect(contextValue.memberRole).toBe('owner'));
    expect(bootstrapMock).toHaveBeenCalledTimes(1);
    expect(findMeMock).not.toHaveBeenCalled();
  });

  it('resolves no membership to null and preserves the role when the user is mutated', async () => {
    bootstrapMock.mockResolvedValue({
      currentUser: { id: 'user_1' },
      accessState: { memberRole: null },
    });
    renderWithProvider();
    await waitFor(() => expect(contextValue.memberRole).toBeNull());
    act(() => contextValue.mutateUser({ id: 'user_1' } as IUser));
    expect(contextValue.memberRole).toBeNull();
  });

  it('hydrates the protected layout membership without fetching', () => {
    renderWithProvider({
      hasInitialBootstrap: true,
      initialCurrentUser: { id: 'user_1' } as IUser,
      initialMemberRole: 'admin',
    });
    expect(contextValue.memberRole).toBe('admin');
    expect(bootstrapMock).not.toHaveBeenCalled();
  });

  it('does not reuse the protected layout role after switching organizations', async () => {
    bootstrapMock.mockResolvedValue({
      currentUser: { id: 'user_1' },
      accessState: { memberRole: 'user' },
    });
    const view = renderWithProvider({
      hasInitialBootstrap: true,
      initialCurrentUser: { id: 'user_1' } as IUser,
      initialMemberRole: 'owner',
      initialOrganizationId: 'org_1',
    });
    expect(contextValue.memberRole).toBe('owner');
    useAuthIdentityMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_1',
      orgId: 'org_2',
    });
    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <UserProvider
          hasInitialBootstrap
          initialCurrentUser={{ id: 'user_1' } as IUser}
          initialMemberRole="owner"
          initialOrganizationId="org_1"
        >
          <Consumer />
        </UserProvider>
      </QueryClientProvider>,
    );
    expect(contextValue.memberRole).toBeUndefined();
    await waitFor(() => expect(contextValue.memberRole).toBe('user'));
    expect(bootstrapMock).toHaveBeenCalledWith(
      'protected-bootstrap:user_1:org_2',
      expect.any(Function),
    );
  });

  it('falls back to findMe when the bootstrap has no user', async () => {
    renderWithProvider();

    await waitFor(() => {
      expect(contextValue.currentUser?.id).toBe('user_1');
    });
    expect(findMeMock).toHaveBeenCalledTimes(1);
    expect(contextValue.isFirstLogin).toBe(true);
  });

  it('uses the bootstrap user when available', async () => {
    bootstrapMock.mockResolvedValue({
      currentUser: { id: 'user_boot', settings: { isFirstLogin: false } },
    });

    renderWithProvider();

    await waitFor(() => {
      expect(contextValue.currentUser?.id).toBe('user_boot');
    });
    expect(findMeMock).not.toHaveBeenCalled();
  });

  it('warns and falls back to findMe when the bootstrap load fails', async () => {
    bootstrapMock.mockRejectedValue(new Error('bootstrap down'));

    renderWithProvider();

    await waitFor(() => {
      expect(contextValue.currentUser?.id).toBe('user_1');
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Failed to load client protected bootstrap for user',
      expect.objectContaining({ reportToSentry: false }),
    );
  });

  it('resolves to null when findMe returns nothing', async () => {
    findMeMock.mockResolvedValue(null);

    renderWithProvider();

    await waitFor(() => {
      expect(findMeMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(contextValue.isLoading).toBe(false);
    });
    expect(contextValue.currentUser).toBeNull();
  });

  it('setIsFirstLogin patches settings and updates the cached user', async () => {
    renderWithProvider();
    await waitFor(() => {
      expect(contextValue.currentUser?.id).toBe('user_1');
    });

    await act(async () => {
      await contextValue.setIsFirstLogin(false);
    });

    expect(patchSettingsMock).toHaveBeenCalledWith('user_1', {
      isFirstLogin: false,
    });
    await waitFor(() => {
      expect(contextValue.isFirstLogin).toBe(false);
    });
  });

  it('setIsFirstLogin logs and keeps state when the patch fails', async () => {
    patchSettingsMock.mockRejectedValue(new Error('patch failed'));

    renderWithProvider();
    await waitFor(() => {
      expect(contextValue.currentUser?.id).toBe('user_1');
    });

    await act(async () => {
      await contextValue.setIsFirstLogin(false);
    });

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to update isFirstLogin status',
      expect.any(Error),
    );
    expect(contextValue.isFirstLogin).toBe(true);
  });

  it('setIsFirstLogin is a no-op without a current user', async () => {
    useAuthIdentityMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      orgId: null,
      userId: null,
    });
    useAuthUserMock.mockReturnValue({ user: null });

    renderWithProvider();
    await waitFor(() => {
      expect(contextValue.currentUser).toBeNull();
    });

    await act(async () => {
      await contextValue.setIsFirstLogin(false);
    });
    expect(patchSettingsMock).not.toHaveBeenCalled();
  });

  it('mutateUser replaces the cached user', async () => {
    renderWithProvider();
    await waitFor(() => {
      expect(contextValue.currentUser?.id).toBe('user_1');
    });

    act(() => {
      contextValue.mutateUser({
        id: 'user_replaced',
        settings: { isFirstLogin: false },
      } as unknown as IUser);
    });

    await waitFor(() => {
      expect(contextValue.currentUser?.id).toBe('user_replaced');
    });
  });

  it('refetchUser re-runs the user query', async () => {
    renderWithProvider();
    await waitFor(() => {
      expect(contextValue.currentUser?.id).toBe('user_1');
    });
    const initialCalls = findMeMock.mock.calls.length;

    await act(async () => {
      await contextValue.refetchUser();
    });
    expect(findMeMock.mock.calls.length).toBeGreaterThan(initialCalls);
  });
});

describe('user-context hooks outside the provider', () => {
  it('useCurrentUser throws without a UserProvider', () => {
    expect(() => renderHook(() => useCurrentUser())).toThrowError(
      /useCurrentUser must be used within a UserProvider/,
    );
  });

  it('useOptionalUser returns undefined without a UserProvider', () => {
    const { result } = renderHook(() => useOptionalUser());
    expect(result.current).toBeUndefined();
  });
});
