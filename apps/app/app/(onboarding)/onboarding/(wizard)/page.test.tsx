// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandContent from './brand/brand-content';
import OnboardingRootPage from './page';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  getToken: vi.fn().mockResolvedValue('token'),
  organizations: vi.fn(),
  isAgentFirst: true,
  isCompleted: false,
  accountType: 'CREATOR',
  steps: [] as string[],
  slug: 'acme',
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
      organization: { slug: mocks.slug, accountType: mocks.accountType },
    },
    brands: [],
  }),
}));
vi.mock('@genfeedai/config/deployment', () => ({
  hasAgentFirstOnboarding: () => mocks.isAgentFirst,
  isDesktopClient: () => !mocks.isAgentFirst,
}));
vi.mock('@hooks/feature-flags/use-feature-flag/use-feature-flag', () => ({
  useFeatureFlag: () => true,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: mocks.getToken }),
}));
vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: () => mocks.getToken(),
}));
vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: () => ({ getMyOrganizations: mocks.organizations }),
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

describe('onboarding entry redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAgentFirst = true;
    mocks.isCompleted = false;
    mocks.accountType = 'CREATOR';
    mocks.steps = [];
    mocks.slug = 'acme';
    mocks.organizations.mockResolvedValue([]);
  });
  it.each([OnboardingRootPage, BrandContent])(
    'never renders the agent-first brand form',
    async (Component) => {
      const view = render(<Component />);
      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith('/acme/~/agent/onboarding'),
      );
      expect(view.container.querySelector('form')).toBeNull();
      expect(view.container.querySelector('input')).toBeNull();
    },
  );
  it('redirects replay to the current brand guide settings', async () => {
    mocks.isCompleted = true;
    render(<OnboardingRootPage />);
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/acme/brand/settings/kit'),
    );
  });
  it('resumes experts after their conversational brand handoff', async () => {
    mocks.accountType = 'EXPERT';
    mocks.steps = ['brand'];
    render(<OnboardingRootPage />);
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/positioning'),
    );
  });
  it('resolves missing org scope or falls back to protected agent bootstrap', async () => {
    mocks.slug = '';
    render(<OnboardingRootPage />);
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/agent/onboarding'),
    );
  });
  it('keeps the classic Desktop wizard', async () => {
    mocks.isAgentFirst = false;
    render(<OnboardingRootPage />);
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/brand'),
    );
  });
  it('cancels an org lookup when unmounted', async () => {
    mocks.slug = '';
    let resolve: (value: never[]) => void = () => {};
    mocks.organizations.mockReturnValue(
      new Promise<never[]>((done) => {
        resolve = done;
      }),
    );
    const view = render(<OnboardingRootPage />);
    await waitFor(() => expect(mocks.organizations).toHaveBeenCalled());
    view.unmount();
    resolve([]);
    await Promise.resolve();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
