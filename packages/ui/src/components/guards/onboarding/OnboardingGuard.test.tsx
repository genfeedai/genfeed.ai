// @vitest-environment jsdom
'use client';

import { render, screen, waitFor } from '@testing-library/react';
import OnboardingGuard from '@ui/guards/onboarding/OnboardingGuard';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();
const pathnameMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

const useCurrentUserMock = vi.fn();
vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

const useAuthMock = vi.fn();
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
}));

const useAccessStateMock = vi.fn();
vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => useAccessStateMock(),
  }),
);

vi.mock('@genfeedai/helpers/auth/clerk.helper', () => ({
  getPlaywrightAuthState: () => null,
}));

describe('OnboardingGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_fake';
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
    pathnameMock.mockReturnValue('/dashboard');
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
  });

  it('should redirect incomplete users to the first onboarding step', async () => {
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
        organizationId: '',
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
      expect(replaceMock).toHaveBeenCalledWith('/onboarding/brand');
    });
  });

  it('should allow onboarding routes without redirect loops', async () => {
    pathnameMock.mockReturnValue('/onboarding/brand');

    useCurrentUserMock.mockReturnValue({
      currentUser: {
        isOnboardingCompleted: false,
        onboardingStepsCompleted: [],
      },
      isLoading: false,
    });
    useAccessStateMock.mockReturnValue({
      accessState: {
        brandId: '',
        creditsBalance: 0,
        hasEverHadCredits: false,
        isOnboardingCompleted: false,
        isSuperAdmin: false,
        organizationId: '',
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

  it('should redirect to onboarding summary when all onboarding steps are completed but completion flag is stale', async () => {
    useCurrentUserMock.mockReturnValue({
      currentUser: {
        isOnboardingCompleted: false,
        onboardingStepsCompleted: ['brand', 'providers', 'summary'],
      },
      isLoading: false,
    });
    useAccessStateMock.mockReturnValue({
      accessState: {
        brandId: '',
        creditsBalance: 0,
        hasEverHadCredits: false,
        isOnboardingCompleted: false,
        isSuperAdmin: false,
        organizationId: '',
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
      expect(replaceMock).toHaveBeenCalledWith('/onboarding/summary');
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
        onboardingStepsCompleted: ['brand', 'providers', 'summary'],
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
