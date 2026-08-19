// @vitest-environment jsdom
'use client';

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsOrganizationSync from './AnalyticsOrganizationSync';

const mocks = vi.hoisted(() => ({
  authIsLoaded: true,
  authUser: {
    id: 'user-1',
    primaryEmailAddress: { emailAddress: 'user@example.com' },
  } as {
    id: string;
    primaryEmailAddress: { emailAddress: string | null } | null;
  } | null,
  capturePageview: vi.fn(),
  clearOrganization: vi.fn(),
  identifyOrganization: vi.fn(),
  identifyUser: vi.fn(),
  isBrandScopeResolved: true,
  organizationId: 'org-1',
  pathname: '/acme/brand/home',
  resetAnalytics: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-user', () => ({
  useAuthUser: () => ({
    isLoaded: mocks.authIsLoaded,
    user: mocks.authUser,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    isBrandScopeResolved: mocks.isBrandScopeResolved,
    organizationId: mocks.organizationId,
  }),
}));

vi.mock('@/lib/analytics', () => ({
  captureAnalyticsPageview: mocks.capturePageview,
  clearAnalyticsOrganization: mocks.clearOrganization,
  identifyAnalyticsOrganization: mocks.identifyOrganization,
  identifyAnalyticsUser: mocks.identifyUser,
  resetAnalytics: mocks.resetAnalytics,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

describe('AnalyticsOrganizationSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authIsLoaded = true;
    mocks.authUser = {
      id: 'user-1',
      primaryEmailAddress: { emailAddress: 'user@example.com' },
    };
    mocks.isBrandScopeResolved = true;
    mocks.organizationId = 'org-1';
    mocks.pathname = '/acme/brand/home';
  });

  it('waits until organization scope is resolved', () => {
    mocks.isBrandScopeResolved = false;

    render(<AnalyticsOrganizationSync />);

    expect(mocks.clearOrganization).toHaveBeenCalledOnce();
    expect(mocks.identifyOrganization).not.toHaveBeenCalled();
    expect(mocks.capturePageview).not.toHaveBeenCalled();
  });

  it('synchronizes identity and organization before capturing a pageview', () => {
    render(<AnalyticsOrganizationSync />);

    expect(mocks.identifyUser).toHaveBeenCalledWith({
      id: 'user-1',
      isInternal: false,
    });
    expect(mocks.identifyOrganization).toHaveBeenCalledWith('org-1');
    expect(mocks.clearOrganization).not.toHaveBeenCalled();
    expect(mocks.identifyOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.capturePageview.mock.invocationCallOrder[0] as number,
    );
  });

  it('updates the association when the active organization changes', () => {
    const { rerender } = render(<AnalyticsOrganizationSync />);

    mocks.organizationId = 'org-2';
    rerender(<AnalyticsOrganizationSync />);

    expect(mocks.identifyOrganization.mock.calls).toEqual([
      ['org-1'],
      ['org-2'],
    ]);
    expect(mocks.capturePageview).toHaveBeenCalledTimes(2);
  });

  it('captures route changes after the existing organization scope', () => {
    const { rerender } = render(<AnalyticsOrganizationSync />);

    mocks.pathname = '/acme/brand/library';
    rerender(<AnalyticsOrganizationSync />);

    expect(mocks.identifyOrganization).toHaveBeenCalledOnce();
    expect(mocks.capturePageview).toHaveBeenCalledTimes(2);
  });

  it('clears the association when organization scope disappears', () => {
    mocks.organizationId = '';

    render(<AnalyticsOrganizationSync />);

    expect(mocks.clearOrganization).toHaveBeenCalledOnce();
    expect(mocks.identifyOrganization).not.toHaveBeenCalled();
    expect(mocks.capturePageview).toHaveBeenCalledOnce();
  });

  it('stops scoped capture when a resolved session becomes anonymous', () => {
    const { rerender } = render(<AnalyticsOrganizationSync />);

    mocks.authUser = null;
    rerender(<AnalyticsOrganizationSync />);

    expect(mocks.resetAnalytics).not.toHaveBeenCalled();
    expect(mocks.capturePageview).toHaveBeenCalledOnce();
  });

  it('preserves the association when the protected shell unmounts', () => {
    const { unmount } = render(<AnalyticsOrganizationSync />);

    unmount();

    expect(mocks.clearOrganization).not.toHaveBeenCalled();
  });
});
