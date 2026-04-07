// @vitest-environment jsdom
'use client';

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();
const pathnameMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

const useCurrentUserMock = vi.fn();
vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

const useAuthMock = vi.fn();
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
}));

const useAccessStateMock = vi.fn();
vi.mock('@providers/access-state/access-state.provider', () => ({
  useAccessState: () => useAccessStateMock(),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  getPlaywrightAuthState: () => null,
}));

describe('OnboardingGuard', () => {
  let OnboardingGuard: typeof import('@ui/guards/onboarding/OnboardingGuard').default;

  beforeEach(() => {
    vi.clearAllMocks();
    pathnameMock.mockReturnValue('/dashboard');
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    return import('@ui/guards/onboarding/OnboardingGuard').then((module) => {
      OnboardingGuard = module.default;
    });
  });

  it('should redirect payg users with credits to chat onboarding', async () => {
    useCurrentUserMock.mockReturnValue({
      currentUser: {
        isOnboardingCompleted: false,
        onboardingStepsCompleted: [],
      },
      isLoading: false,
    });
    useAccessStateMock.mockReturnValue({
      accessState: {
        brandId: 'brand_1',
        creditsBalance: 250,
        hasEverHadCredits: true,
        isOnboardingCompleted: false,
        isSuperAdmin: false,
        organizationId: 'org_1',
        subscriptionStatus: 'canceled',
        subscriptionTier: 'payg',
        userId: 'user_1',
      },
      hasPaygCredits: true,
      isByok: false,
      isLoading: false,
      isSubscribed: false,
      isSuperAdmin: false,
      needsOnboarding: true,
    });

    render(
      <OnboardingGuard>
        <div>Child</div>
      </OnboardingGuard>,
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/chat/onboarding');
    });
  });

  it('should allow onboarding chat route without credits', async () => {
    pathnameMock.mockReturnValue('/chat/onboarding');

    useCurrentUserMock.mockReturnValue({
      currentUser: {
        isOnboardingCompleted: false,
        onboardingStepsCompleted: [],
      },
      isLoading: false,
    });
    useAccessStateMock.mockReturnValue({
      accessState: {
        brandId: 'brand_1',
        creditsBalance: 0,
        hasEverHadCredits: false,
        isOnboardingCompleted: false,
        isSuperAdmin: false,
        organizationId: 'org_1',
        subscriptionStatus: 'canceled',
        subscriptionTier: 'free',
        userId: 'user_1',
      },
      hasPaygCredits: false,
      isByok: false,
      isLoading: false,
      isSubscribed: false,
      isSuperAdmin: false,
      needsOnboarding: true,
    });

    render(
      <OnboardingGuard>
        <div>Child</div>
      </OnboardingGuard>,
    );

    await waitFor(() => {
      expect(replaceMock).not.toHaveBeenCalled();
    });

    expect(await screen.findByText('Child')).toBeInTheDocument();
  });

  it('should redirect to onboarding plan when all onboarding steps are completed but completion flag is stale', async () => {
    useCurrentUserMock.mockReturnValue({
      currentUser: {
        isOnboardingCompleted: false,
        onboardingStepsCompleted: ['brand', 'plan'],
      },
      isLoading: false,
    });
    useAccessStateMock.mockReturnValue({
      accessState: {
        brandId: 'brand_1',
        creditsBalance: 0,
        hasEverHadCredits: false,
        isOnboardingCompleted: false,
        isSuperAdmin: false,
        organizationId: 'org_1',
        subscriptionStatus: 'canceled',
        subscriptionTier: 'free',
        userId: 'user_1',
      },
      hasPaygCredits: false,
      isByok: false,
      isLoading: false,
      isSubscribed: false,
      isSuperAdmin: false,
      needsOnboarding: true,
    });

    render(
      <OnboardingGuard>
        <div>Child</div>
      </OnboardingGuard>,
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/onboarding/plan');
    });
  });

  it('should redirect unsigned users to login', async () => {
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });
    useCurrentUserMock.mockReturnValue({
      currentUser: null,
      isLoading: false,
    });
    useAccessStateMock.mockReturnValue({
      accessState: null,
      hasPaygCredits: false,
      isByok: false,
      isLoading: false,
      isSubscribed: false,
      isSuperAdmin: false,
      needsOnboarding: true,
    });

    render(
      <OnboardingGuard>
        <div>Child</div>
      </OnboardingGuard>,
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login');
    });
  });

  it('renders children immediately when onboarding is complete and access is valid', async () => {
    useCurrentUserMock.mockReturnValue({
      currentUser: {
        isOnboardingCompleted: true,
        onboardingStepsCompleted: ['brand', 'plan'],
      },
      isLoading: false,
    });
    useAccessStateMock.mockReturnValue({
      accessState: {
        brandId: 'brand_1',
        creditsBalance: 0,
        hasEverHadCredits: false,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        organizationId: 'org_1',
        subscriptionStatus: 'active',
        subscriptionTier: 'pro',
        userId: 'user_1',
      },
      hasPaygCredits: false,
      isByok: false,
      isLoading: false,
      isSubscribed: true,
      isSuperAdmin: false,
      needsOnboarding: false,
    });

    render(
      <OnboardingGuard>
        <div>Ready Child</div>
      </OnboardingGuard>,
    );

    expect(screen.getByText('Ready Child')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
