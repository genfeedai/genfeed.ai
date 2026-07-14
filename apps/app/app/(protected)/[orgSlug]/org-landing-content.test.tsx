// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  brandState: {
    brands: [] as Array<{
      createdAt?: string;
      id: string;
      label: string;
      logoUrl?: string;
      slug: string;
      totalCredentials: number;
    }>,
    isReady: true,
  },
  currentUserState: {
    currentUser: {
      id: 'user_1',
      isOnboardingCompleted: true,
      onboardingStepsCompleted: ['brand', 'providers', 'summary'] as string[],
    },
    isLoading: false,
  },
  replace: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brandState,
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => mocks.currentUserState,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) => `/acme/~${path}`,
    orgSlug: 'acme',
  }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span aria-label={alt} data-src={src} role="img" />
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
}));

vi.mock('@/components/ui/client-formatted-date', () => ({
  ClientFormattedDate: ({ value }: { value: string }) => <span>{value}</span>,
}));

const { default: OrgLandingContent } = await import('./org-landing-content');

describe('OrgLandingContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandState.isReady = true;
    mocks.brandState.brands = [];
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: true,
      onboardingStepsCompleted: ['brand', 'providers', 'summary'],
    };
    mocks.currentUserState.isLoading = false;
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
  });

  it('redirects to onboarding when the organization has no projects', async () => {
    render(<OrgLandingContent />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding');
    });
  });

  it('redirects into the only project when one project exists', async () => {
    mocks.brandState.brands = [
      {
        id: 'brand_1',
        label: 'Moonrise',
        slug: 'moonrise',
        totalCredentials: 0,
      },
    ];

    render(<OrgLandingContent />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        '/acme/moonrise/workspace/overview',
      );
    });
  });

  it('resumes onboarding before redirecting into a seeded project', async () => {
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: false,
      onboardingStepsCompleted: [],
    };
    mocks.brandState.brands = [
      {
        id: 'brand_1',
        label: 'Default Organization',
        slug: 'default',
        totalCredentials: 0,
      },
    ];

    render(<OrgLandingContent />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/brand');
    });
  });

  it('routes incomplete SaaS users to the agent onboarding surface', async () => {
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: false,
      onboardingStepsCompleted: [],
    };
    mocks.brandState.brands = [
      {
        id: 'brand_1',
        label: 'Default Organization',
        slug: 'default',
        totalCredentials: 0,
      },
    ];

    render(<OrgLandingContent />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/acme/~/agent/onboarding');
    });
  });

  it('keeps cloud-connected desktop org-root navigation on the classic wizard', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'true');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: false,
      onboardingStepsCompleted: [],
    };
    mocks.brandState.brands = [
      {
        id: 'brand_1',
        label: 'Default Organization',
        slug: 'default',
        totalCredentials: 0,
      },
    ];

    render(<OrgLandingContent />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/brand');
    });
  });

  it('renders the project picker when multiple projects exist', () => {
    mocks.brandState.brands = [
      {
        id: 'brand_1',
        label: 'Moonrise',
        slug: 'moonrise',
        totalCredentials: 1,
      },
      {
        id: 'brand_2',
        label: 'Solar',
        slug: 'solar',
        totalCredentials: 0,
      },
    ];

    render(<OrgLandingContent />);

    expect(screen.getByText('Projects')).toBeVisible();
    expect(screen.getByRole('link', { name: /moonrise/i })).toHaveAttribute(
      'href',
      '/acme/moonrise/workspace/overview',
    );
    expect(screen.getByRole('link', { name: /new brand/i })).toHaveAttribute(
      'href',
      '/acme/~/settings/brands',
    );
  });
});
