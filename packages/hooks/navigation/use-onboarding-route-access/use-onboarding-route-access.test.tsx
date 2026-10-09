// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingRouteAccess } from './use-onboarding-route-access';

const state = vi.hoisted(() => ({
  isAgentFirst: true,
  accountType: 'CREATOR',
  steps: [] as string[],
}));
vi.mock('@genfeedai/config/deployment', () => ({
  hasAgentFirstOnboarding: () => state.isAgentFirst,
  isCloudDeployment: () => false,
}));
vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: () => false,
}));
vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => ({
      accessState: {},
      needsOnboarding: true,
      isLoading: false,
      isSubscribed: false,
      isSuperAdmin: false,
      hasPaygCredits: false,
    }),
  }),
);
vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: {
      id: 'user-1',
      isOnboardingCompleted: false,
      onboardingStepsCompleted: state.steps,
    },
    isLoading: false,
  }),
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    selectedBrand: {
      organization: { slug: 'acme', accountType: state.accountType },
    },
    brands: [],
  }),
}));
vi.mock('@genfeedai/helpers/auth/auth.helper', () => ({
  getPlaywrightAuthState: () => null,
}));
vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock('@hooks/feature-flags/use-feature-flag/use-feature-flag', () => ({
  useFeatureFlag: () => true,
}));
describe('agent-first route access', () => {
  beforeEach(() => {
    state.isAgentFirst = true;
    state.accountType = 'CREATOR';
    state.steps = [];
  });
  it('allows the conversation before the brand step is complete', () => {
    const { result } = renderHook(() =>
      useOnboardingRouteAccess('/acme/~/agent/onboarding/thread-1'),
    );
    expect(result.current).toEqual({ canRender: true, redirectTarget: null });
  });
  it('sends first-run workspace access to the conversation', () => {
    const { result } = renderHook(() =>
      useOnboardingRouteAccess('/acme/brand/workspace'),
    );
    expect(result.current.redirectTarget).toBe('/acme/~/agent/onboarding');
  });
  it('resumes experts at positioning after the brand handoff', () => {
    state.accountType = 'EXPERT';
    state.steps = ['brand'];
    const { result } = renderHook(() =>
      useOnboardingRouteAccess('/acme/~/agent/onboarding'),
    );
    expect(result.current.redirectTarget).toBe('/onboarding/positioning');
  });
  it('preserves the classic wizard on agent-off surfaces', () => {
    state.isAgentFirst = false;
    const { result } = renderHook(() =>
      useOnboardingRouteAccess('/acme/brand/workspace'),
    );
    expect(result.current.redirectTarget).toBe('/onboarding/brand');
  });
});
