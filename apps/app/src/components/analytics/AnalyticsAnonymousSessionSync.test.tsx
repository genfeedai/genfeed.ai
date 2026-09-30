// @vitest-environment jsdom
'use client';

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsAnonymousSessionSync from './AnalyticsAnonymousSessionSync';

const mocks = vi.hoisted(() => ({
  ensureAnonymous: vi.fn(),
  isAnalyticsEnabled: vi.fn(),
  isLoaded: false,
  useAuthUser: vi.fn(),
  userId: null as string | null,
}));

vi.mock('@hooks/auth/use-auth-user', () => ({
  useAuthUser: mocks.useAuthUser,
}));

vi.mock('@/lib/analytics', () => ({
  ensureAnalyticsAnonymous: mocks.ensureAnonymous,
  isAnalyticsEnabled: mocks.isAnalyticsEnabled,
}));

describe('AnalyticsAnonymousSessionSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAnalyticsEnabled.mockReturnValue(true);
    mocks.isLoaded = false;
    mocks.userId = null;
    mocks.useAuthUser.mockImplementation(() => ({
      isLoaded: mocks.isLoaded,
      user: mocks.userId ? { id: mocks.userId } : null,
    }));
  });

  it('does not subscribe to auth when analytics is disabled', () => {
    mocks.isAnalyticsEnabled.mockReturnValue(false);

    render(<AnalyticsAnonymousSessionSync />);

    expect(mocks.useAuthUser).not.toHaveBeenCalled();
    expect(mocks.ensureAnonymous).not.toHaveBeenCalled();
  });

  it('waits while authentication is unresolved', () => {
    render(<AnalyticsAnonymousSessionSync />);

    expect(mocks.ensureAnonymous).not.toHaveBeenCalled();
  });

  it('clears stale persisted account scope for a resolved anonymous session', () => {
    mocks.isLoaded = true;

    render(<AnalyticsAnonymousSessionSync />);

    expect(mocks.ensureAnonymous).toHaveBeenCalledOnce();
  });

  it('does not override authenticated or explicitly reset sessions', () => {
    mocks.isLoaded = true;
    mocks.userId = 'user-1';

    render(<AnalyticsAnonymousSessionSync />);

    expect(mocks.ensureAnonymous).not.toHaveBeenCalled();
  });

  it('reacts when an authenticated session expires', () => {
    mocks.isLoaded = true;
    mocks.userId = 'user-1';
    const { rerender } = render(<AnalyticsAnonymousSessionSync />);

    mocks.userId = null;
    rerender(<AnalyticsAnonymousSessionSync />);

    expect(mocks.ensureAnonymous).toHaveBeenCalledOnce();
  });
});
