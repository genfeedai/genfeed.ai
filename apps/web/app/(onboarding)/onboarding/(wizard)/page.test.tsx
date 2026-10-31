// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingRootPage from './page';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  isSingleStep: true,
  isCompleted: false,
  accountType: 'CREATOR',
  steps: [] as string[],
}));
vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    isLoading: false,
    currentUser: {
      id: 'user-1',
      isOnboardingCompleted: mocks.isCompleted,
      onboardingStepsCompleted: mocks.steps,
    },
  }),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    isBrandScopeResolved: true,
    selectedBrand: {
      id: 'brand-1',
      slug: 'brand',
      organization: { slug: 'acme', accountType: mocks.accountType },
    },
    brands: [],
  }),
}));
vi.mock('@genfeedai/config/deployment', () => ({
  hasSingleStepOnboarding: () => mocks.isSingleStep,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

describe('onboarding entry redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSingleStep = true;
    mocks.isCompleted = false;
    mocks.accountType = 'CREATOR';
    mocks.steps = [];
  });
  it('sends a new user to the single onboarding page', async () => {
    const view = render(<OnboardingRootPage />);
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/brand'),
    );
    expect(view.container.querySelector('form')).toBeNull();
  });
  it('never routes to the removed agent conversation', async () => {
    render(<OnboardingRootPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    expect(mocks.replace).not.toHaveBeenCalledWith(
      expect.stringContaining('agent'),
    );
  });
  it('replays onboarding from the first step for a finished user', async () => {
    mocks.isCompleted = true;
    mocks.steps = ['brand', 'providers', 'summary'];
    render(<OnboardingRootPage />);
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/brand'),
    );
    expect(mocks.replace).not.toHaveBeenCalledWith('/');
  });
  it('sends a user with every step done but no completion flag to the app', async () => {
    mocks.steps = ['brand', 'providers', 'summary'];
    render(<OnboardingRootPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'));
  });
  it('resumes experts after their brand step', async () => {
    mocks.accountType = 'EXPERT';
    mocks.steps = ['brand'];
    render(<OnboardingRootPage />);
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/positioning'),
    );
  });
  it('keeps the classic Desktop wizard', async () => {
    mocks.isSingleStep = false;
    mocks.steps = ['brand'];
    render(<OnboardingRootPage />);
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/providers'),
    );
  });
});
