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
  hasCreditsRemaining: false,
  hasPaygCredits: false,
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
      hasCreditsRemaining: state.hasCreditsRemaining,
      hasPaygCredits: state.hasPaygCredits,
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
    state.hasCreditsRemaining = false;
    state.hasPaygCredits = false;
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
  describe('unsubscribed org with billing on and onboarding completed', () => {
    beforeEach(() => {
      state.hasBilling = true;
      state.needsOnboarding = false;
      state.isOnboardingCompleted = true;
    });
    it('sends agent-first users to the credits page instead of the classic summary', () => {
      const { result } = renderHook(() =>
        useOnboardingRouteAccess('/acme/brand/settings/brand-kit'),
      );
      expect(result.current).toEqual({
        canRender: false,
        redirectTarget: '/acme/~/settings/credits',
      });
    });
    it('does not loop once the user is on the credits or subscription page', () => {
      for (const path of [
        '/acme/~/settings/credits',
        '/acme/~/settings/subscription',
      ]) {
        const { result } = renderHook(() => useOnboardingRouteAccess(path));
        expect(result.current).toEqual({
          canRender: true,
          redirectTarget: null,
        });
      }
    });
    it('keeps the summary paywall on agent-off surfaces', () => {
      state.isAgentFirst = false;
      const { result } = renderHook(() =>
        useOnboardingRouteAccess('/acme/brand/settings/brand-kit'),
      );
      expect(result.current.redirectTarget).toBe('/onboarding/summary');
    });
    it('lets the org use the app while onboarding credits remain', () => {
      state.hasCreditsRemaining = true;
      state.hasPaygCredits = true;
      for (const path of [
        '/acme/brand/studio/generate',
        '/acme/brand/library/assets',
        '/acme/brand/settings/brand-kit',
      ]) {
        const { result } = renderHook(() => useOnboardingRouteAccess(path));
        expect(result.current).toEqual({
          canRender: true,
          redirectTarget: null,
        });
      }
    });
    it('paywalls once the gifted credits are spent, even though the org has had credits', () => {
      state.hasPaygCredits = true;
      state.hasCreditsRemaining = false;
      const { result } = renderHook(() =>
        useOnboardingRouteAccess('/acme/brand/studio/generate'),
      );
      expect(result.current).toEqual({
        canRender: false,
        redirectTarget: '/acme/~/settings/credits',
      });
    });
    it('paywalls a just-finished user whose access snapshot still says onboarding', () => {
      state.needsOnboarding = true;
      const { result } = renderHook(() =>
        useOnboardingRouteAccess('/acme/brand/studio/generate'),
      );
      expect(result.current.redirectTarget).toBe('/acme/~/settings/credits');
    });
    it('paywalls an org without brands using the org from the URL', () => {
      state.hasBrand = false;
      const { result } = renderHook(() =>
        useOnboardingRouteAccess('/acme/~/settings/members'),
      );
      expect(result.current.redirectTarget).toBe('/acme/~/settings/credits');
    });
    it('does not paywall subscribed orgs or super admins', () => {
      for (const flag of ['isSubscribed', 'isSuperAdmin'] as const) {
        state.isSubscribed = flag === 'isSubscribed';
        state.isSuperAdmin = flag === 'isSuperAdmin';
        const { result } = renderHook(() =>
          useOnboardingRouteAccess('/acme/brand/studio/generate'),
        );
        expect(result.current.redirectTarget).toBeNull();
      }
    });
    it('does not paywall deployments without organization billing', () => {
      state.hasBilling = false;
      const { result } = renderHook(() =>
        useOnboardingRouteAccess('/acme/brand/studio/generate'),
      );
      expect(result.current).toEqual({
        canRender: true,
        redirectTarget: null,
      });
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
