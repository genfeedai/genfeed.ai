// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscoverOrgBrandGate } from './discover-org-brand-gate';

const mocks = vi.hoisted(() => ({
  brands: [] as Array<{ id: string; label: string; slug: string }>,
  isReady: true,
  orgSlug: 'acme',
  pathname: '/acme/~/discover/overview',
  replace: vi.fn(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brands: mocks.brands,
    isReady: mocks.isReady,
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context.helpers', () => ({
  getBrandEntityId: (brand: { id?: string } | null | undefined) =>
    brand?.id ?? '',
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgSlug: mocks.orgSlug }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@ui/loading/page/PageLoadingState', () => ({
  default: () => <div>Loading discover</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    asChild,
    children,
  }: {
    asChild?: boolean;
    children?: ReactNode;
  }) => (asChild ? children : <button type="button">{children}</button>),
}));

describe('DiscoverOrgBrandGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brands = [];
    mocks.isReady = true;
    mocks.orgSlug = 'acme';
    mocks.pathname = '/acme/~/discover/overview';
  });

  it('renders children on brand-scoped discover routes', () => {
    mocks.pathname = '/acme/moonrise/discover/overview';

    render(
      <DiscoverOrgBrandGate>
        <div>Brand discover content</div>
      </DiscoverOrgBrandGate>,
    );

    expect(screen.getByText('Brand discover content')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('redirects to the only brand when one brand exists', () => {
    mocks.brands = [{ id: 'brand-1', label: 'Moonrise', slug: 'moonrise' }];

    render(
      <DiscoverOrgBrandGate>
        <div>Should not render</div>
      </DiscoverOrgBrandGate>,
    );

    expect(mocks.replace).toHaveBeenCalledWith(
      '/acme/moonrise/discover/overview',
    );
  });

  it('lists brands when more than one brand exists', () => {
    mocks.brands = [
      { id: 'brand-1', label: 'Moonrise', slug: 'moonrise' },
      { id: 'brand-2', label: 'Paperclip', slug: 'paperclip' },
    ];

    render(
      <DiscoverOrgBrandGate>
        <div>Should not render</div>
      </DiscoverOrgBrandGate>,
    );

    expect(
      screen.getByRole('heading', { name: 'Choose a brand for Discover' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Moonrise' })).toHaveAttribute(
      'href',
      '/acme/moonrise/discover/overview',
    );
    expect(screen.getByRole('link', { name: 'Paperclip' })).toHaveAttribute(
      'href',
      '/acme/paperclip/discover/overview',
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('preserves nested discover paths when linking brands', () => {
    mocks.pathname = '/acme/~/discover/ads/google';
    mocks.brands = [
      { id: 'brand-1', label: 'Moonrise', slug: 'moonrise' },
      { id: 'brand-2', label: 'Paperclip', slug: 'paperclip' },
    ];

    render(
      <DiscoverOrgBrandGate>
        <div>Should not render</div>
      </DiscoverOrgBrandGate>,
    );

    expect(screen.getByRole('link', { name: 'Moonrise' })).toHaveAttribute(
      'href',
      '/acme/moonrise/discover/ads/google',
    );
  });

  it('shows an empty state when the org has no brands', () => {
    render(
      <DiscoverOrgBrandGate>
        <div>Should not render</div>
      </DiscoverOrgBrandGate>,
    );

    expect(
      screen.getByRole('heading', { name: 'Discover needs a brand' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to brands' })).toHaveAttribute(
      'href',
      '/acme/~/settings/brands',
    );
  });
});
