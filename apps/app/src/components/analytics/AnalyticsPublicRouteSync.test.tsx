// @vitest-environment jsdom
'use client';

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsPublicRouteSync from './AnalyticsPublicRouteSync';

const mocks = vi.hoisted(() => ({
  authIsLoaded: true,
  authUser: null as {
    id: string;
    primaryEmailAddress: { emailAddress: string | null } | null;
  } | null,
  capturePageview: vi.fn(),
  clearOrganization: vi.fn(),
  ensureAnonymous: vi.fn(),
  identifyUser: vi.fn(),
  isAnalyticsEnabled: vi.fn(),
  pathname: '/login',
  resetAnalytics: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-user', () => ({
  useAuthUser: () => ({
    isLoaded: mocks.authIsLoaded,
    user: mocks.authUser,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('@/lib/analytics', () => ({
  captureAnalyticsPageview: mocks.capturePageview,
  clearAnalyticsOrganization: mocks.clearOrganization,
  ensureAnalyticsAnonymous: mocks.ensureAnonymous,
  identifyAnalyticsUser: mocks.identifyUser,
  isAnalyticsEnabled: mocks.isAnalyticsEnabled,
  resetAnalytics: mocks.resetAnalytics,
}));

describe('AnalyticsPublicRouteSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAnalyticsEnabled.mockReturnValue(true);
    mocks.authIsLoaded = true;
    mocks.authUser = null;
    mocks.pathname = '/login';
  });

  it('does not subscribe to auth when analytics is disabled', () => {
    mocks.isAnalyticsEnabled.mockReturnValue(false);

    render(<AnalyticsPublicRouteSync />);

    expect(mocks.ensureAnonymous).not.toHaveBeenCalled();
    expect(mocks.identifyUser).not.toHaveBeenCalled();
    expect(mocks.capturePageview).not.toHaveBeenCalled();
  });

  it('waits for resolved authentication state', () => {
    mocks.authIsLoaded = false;

    render(<AnalyticsPublicRouteSync />);

    expect(mocks.ensureAnonymous).not.toHaveBeenCalled();
    expect(mocks.capturePageview).not.toHaveBeenCalled();
  });

  it('ensures anonymous scope before a signed-out public pageview', () => {
    render(<AnalyticsPublicRouteSync />);

    expect(mocks.ensureAnonymous).toHaveBeenCalledOnce();
    expect(mocks.ensureAnonymous.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.capturePageview.mock.invocationCallOrder[0] as number,
    );
    expect(mocks.resetAnalytics).not.toHaveBeenCalled();
  });

  it('preserves authenticated attribution for signed-in public callbacks', () => {
    mocks.authUser = {
      id: 'user-1',
      primaryEmailAddress: { emailAddress: 'user@example.com' },
    };

    render(<AnalyticsPublicRouteSync />);

    expect(mocks.identifyUser).toHaveBeenCalledWith({
      id: 'user-1',
      isInternal: false,
    });
    expect(mocks.clearOrganization).toHaveBeenCalledOnce();
    expect(mocks.clearOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.capturePageview.mock.invocationCallOrder[0] as number,
    );
    expect(mocks.ensureAnonymous).not.toHaveBeenCalled();
  });

  it('leaves explicit logout lifecycle ownership to the logout page', () => {
    mocks.authUser = {
      id: 'user-1',
      primaryEmailAddress: { emailAddress: 'user@example.com' },
    };
    mocks.pathname = '/logout';

    render(<AnalyticsPublicRouteSync />);

    expect(mocks.resetAnalytics).not.toHaveBeenCalled();
    expect(mocks.identifyUser).not.toHaveBeenCalled();
    expect(mocks.capturePageview).not.toHaveBeenCalled();
  });

  it('captures later public routes without rotating anonymous identity again', () => {
    const { rerender } = render(<AnalyticsPublicRouteSync />);

    mocks.pathname = '/forgot-password';
    rerender(<AnalyticsPublicRouteSync />);

    expect(mocks.ensureAnonymous).toHaveBeenCalledOnce();
    expect(mocks.resetAnalytics).not.toHaveBeenCalled();
    expect(mocks.capturePageview).toHaveBeenCalledTimes(2);
  });
});
