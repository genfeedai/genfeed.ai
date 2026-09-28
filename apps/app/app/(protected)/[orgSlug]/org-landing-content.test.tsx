// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
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
  default: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    replace: mocks.replace,
  }),
}));

vi.mock('@/components/ui/client-formatted-date', () => ({
  ClientFormattedDate: ({ value }: { value: string }) => <span>{value}</span>,
}));

const { default: OrgLandingContent } = await import('./org-landing-content');

function createBrands(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `brand_${index + 1}`,
    label: `Brand ${index + 1}`,
    slug: `brand-${index + 1}`,
    totalCredentials: 0,
  }));
}

describe('OrgLandingContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
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

  it('redirects to the shared brand step when the organization has no projects', async () => {
    render(<OrgLandingContent />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/brand');
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
      expect(mocks.replace).toHaveBeenCalledWith('/acme/moonrise/workspace');
    });
  });

  it('routes incomplete Community users to the shared brand step before a seeded project', async () => {
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

  it('keeps self-hosted desktop org-root navigation on the classic wizard', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'true');
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

  it('routes incomplete SaaS users to the shared brand step', async () => {
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
      '/acme/moonrise/workspace',
    );
    expect(screen.getByRole('link', { name: /new brand/i })).toHaveAttribute(
      'href',
      '/acme/~/settings/brands',
    );
  });

  it('renders brand cards through the shared Card surface', () => {
    mocks.brandState.brands = [
      {
        createdAt: '2026-01-02T00:00:00.000Z',
        id: 'brand_1',
        label: 'Moonrise',
        slug: 'moonrise',
        totalCredentials: 2,
      },
      {
        id: 'brand_2',
        label: 'Solar',
        slug: 'solar',
        totalCredentials: 0,
      },
    ];

    render(<OrgLandingContent />);

    const [moonrise, solar] = screen.getAllByTestId('org-brand-card');
    const surface = moonrise.firstElementChild as HTMLElement;

    expect(moonrise).toHaveAttribute('href', '/acme/moonrise/workspace');
    expect(moonrise.className).not.toMatch(/rounded-card|bg-card|hover:bg-/);
    expect(surface).toHaveClass(
      'rounded-card',
      'shadow-border',
      'hover:shadow-border-strong',
    );
    expect(surface.className).not.toMatch(/hover:bg-/);
    expect(moonrise).toHaveTextContent(
      '@moonrise · 2 platforms · 2026-01-02T00:00:00.000Z',
    );
    expect(solar).toHaveTextContent('@solar');
    expect(solar).not.toHaveTextContent('platform');
  });

  it('defaults to logo cards with a list toggle for up to 6 brands', () => {
    mocks.brandState.brands = createBrands(6);

    render(<OrgLandingContent />);

    expect(screen.getAllByTestId('org-brand-card')).toHaveLength(6);
    expect(screen.queryByTestId('org-brand-row')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Grid' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'List' }));

    expect(screen.getAllByTestId('org-brand-row')).toHaveLength(6);
    expect(screen.queryByTestId('org-brand-card')).toBeNull();
  });

  it('defaults to the list view above 6 brands and keeps the grid toggle', () => {
    mocks.brandState.brands = createBrands(7);

    render(<OrgLandingContent />);

    const rows = screen.getAllByTestId('org-brand-row');
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveAttribute('href', '/acme/brand-1/workspace');
    expect(screen.queryByTestId('org-brand-card')).toBeNull();
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }));

    expect(screen.getAllByTestId('org-brand-card')).toHaveLength(7);
  });
});
