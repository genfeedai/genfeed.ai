import { ONBOARDING_STEPS } from '@genfeedai/contracts/constants';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUser: { isLoading: false } as {
    isLoading: boolean;
    currentUser?: { onboardingStepsCompleted: string[] };
  },
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => mocks.currentUser,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    isBrandScopeResolved: true,
    selectedBrand: {
      id: 'brand-1',
      slug: 'brand',
      organization: { slug: 'acme', accountType: 'CREATOR' },
    },
    brands: [],
  }),
}));
vi.mock('@genfeedai/config/deployment', () => ({
  hasAgentFirstOnboarding: () => true,
}));
vi.mock('@hooks/feature-flags/use-feature-flag/use-feature-flag', () => ({
  useFeatureFlag: () => true,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));

import OnboardingRootPage from './page';

describe('OnboardingRootPage routing', () => {
  beforeEach(() => {
    mocks.replace.mockClear();
    mocks.currentUser = {
      currentUser: {
        onboardingStepsCompleted: [...ONBOARDING_STEPS],
      },
      isLoading: false,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens brand settings when every onboarding step is already complete', async () => {
    render(<OnboardingRootPage />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/acme/brand/settings/kit');
    });
    expect(mocks.replace).not.toHaveBeenCalledWith('/onboarding/summary');
  });

  it('resumes at the first incomplete step for a mid-onboarding user', async () => {
    mocks.currentUser = {
      currentUser: { onboardingStepsCompleted: ['brand'] },
      isLoading: false,
    };

    render(<OnboardingRootPage />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/acme/~/agent/onboarding');
    });
  });
});
