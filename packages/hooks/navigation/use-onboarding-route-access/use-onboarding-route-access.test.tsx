// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingRouteAccess } from './use-onboarding-route-access';

const state = vi.hoisted(() => ({
  isAgentFirst: true,
  accountType: 'CREATOR',
  steps: [] as string[],
  hasBilling: false,
  needsOnboarding: true,
  isOnboardingCompleted: false,
  isTrialUsedUp: false,
  isSubscribed: false,
  isSuperAdmin: false,
  hasBrand: true,
}));
vi.mock('@genfeedai/config/deployment', () => ({
  hasAgentFirstOnboarding: () => state.isAgentFirst,
  isCloudDeployment: () => false,
}));
vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: () => state.hasBilling,
}));
vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => ({
      accessState: {},
      needsOnboarding: state.needsOnboarding,
      isLoading: false,
      isSubscribed: state.isSubscribed,
      isSuperAdmin: state.isSuperAdmin,
      isTrialUsedUp: state.isTrialUsedUp,
    }),
  }),
);
vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: {
      id: 'user-1',
      isOnboardingCompleted: state.isOnboardingCompleted,
      onboardingStepsCompleted: state.steps,
    },
    isLoading: false,
  }),
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    selectedBrand: state.hasBrand
      ? { organization: { slug: 'acme', accountType: state.accountType } }
      : undefined,
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
    state.hasBilling = false;
    state.needsOnboarding = true;
    state.isOnboardingCompleted = false;
    state.isTrialUsedUp = false;
    state.isSubscribed = false;
    state.isSuperAdmin = false;
    state.hasBrand = true;
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
  describe('unsubscribed org with billing on, onboarding done and no generating credits left', () => {
    beforeEach(() => {
      state.hasBilling = true;
      state.needsOnboarding = false;
      state.isOnboardingCompleted = true;
      state.isTrialUsedUp = true;
    });
    const readablePaths = [
      '/acme/brand/library/assets',
      '/acme/brand/settings/brand-kit',
      '/acme/brand/studio/generate',
      '/acme/~/settings/members',
      '/acme/~/settings/credits',
    ];
    it('keeps every route reachable in agent-first mode', () => {
      for (const path of readablePaths) {
        const { result } = renderHook(() => useOnboardingRouteAccess(path));
        expect(result.current).toEqual({
          canRender: true,
          redirectTarget: null,
        });
      }
    });
    it('keeps every route reachable on agent-off surfaces too', () => {
      state.isAgentFirst = false;
      for (const path of readablePaths) {
        const { result } = renderHook(() => useOnboardingRouteAccess(path));
        expect(result.current).toEqual({
          canRender: true,
          redirectTarget: null,
        });
      }
    });
    it('keeps every route reachable for an org without brands', () => {
      state.hasBrand = false;
      const { result } = renderHook(() =>
        useOnboardingRouteAccess('/acme/~/settings/members'),
      );
      expect(result.current.redirectTarget).toBeNull();
    });
  });
  it('never paywalls mid-onboarding, even with no credits and billing on', () => {
    state.hasBilling = true;
    const conversation = renderHook(() =>
      useOnboardingRouteAccess('/acme/~/agent/onboarding/thread-1'),
    );
    expect(conversation.result.current).toEqual({
      canRender: true,
      redirectTarget: null,
    });
    const workspace = renderHook(() =>
      useOnboardingRouteAccess('/acme/brand/workspace'),
    );
    expect(workspace.result.current.redirectTarget).toBe(
      '/acme/~/agent/onboarding',
    );
  });
});
