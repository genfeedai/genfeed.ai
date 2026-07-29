// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResearchOrgBrandGate } from './research-org-brand-gate';

const mocks = vi.hoisted(() => ({
  brands: [] as Array<{ id: string; label: string; slug: string }>,
  isReady: true,
  orgSlug: 'acme',
  pathname: '/acme/~/research/discovery',
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

vi.mock('@ui/loading/fallback/LazyLoadingFallback', () => ({
  default: () => <div>Loading research</div>,
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

describe('ResearchOrgBrandGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brands = [];
    mocks.isReady = true;
    mocks.orgSlug = 'acme';
    mocks.pathname = '/acme/~/research/discovery';
  });

  it('renders children on brand-scoped research routes', () => {
    mocks.pathname = '/acme/moonrise/research/discovery';

    render(
      <ResearchOrgBrandGate>
        <div>Brand research content</div>
      </ResearchOrgBrandGate>,
    );

    expect(screen.getByText('Brand research content')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('redirects to the only brand when one brand exists', () => {
    mocks.brands = [{ id: 'brand-1', label: 'Moonrise', slug: 'moonrise' }];

    render(
      <ResearchOrgBrandGate>
        <div>Should not render</div>
      </ResearchOrgBrandGate>,
    );

    expect(mocks.replace).toHaveBeenCalledWith(
      '/acme/moonrise/research/discovery',
    );
  });

  it('lists brands when more than one brand exists', () => {
    mocks.brands = [
      { id: 'brand-1', label: 'Moonrise', slug: 'moonrise' },
      { id: 'brand-2', label: 'Paperclip', slug: 'paperclip' },
    ];

    render(
      <ResearchOrgBrandGate>
        <div>Should not render</div>
      </ResearchOrgBrandGate>,
    );

    expect(
      screen.getByRole('heading', { name: 'Choose a brand for Research' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Moonrise' })).toHaveAttribute(
      'href',
      '/acme/moonrise/research/discovery',
    );
    expect(screen.getByRole('link', { name: 'Paperclip' })).toHaveAttribute(
      'href',
      '/acme/paperclip/research/discovery',
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('preserves nested research paths when linking brands', () => {
    mocks.pathname = '/acme/~/research/ads/google';
    mocks.brands = [
      { id: 'brand-1', label: 'Moonrise', slug: 'moonrise' },
      { id: 'brand-2', label: 'Paperclip', slug: 'paperclip' },
    ];

    render(
      <ResearchOrgBrandGate>
        <div>Should not render</div>
      </ResearchOrgBrandGate>,
    );

    expect(screen.getByRole('link', { name: 'Moonrise' })).toHaveAttribute(
      'href',
      '/acme/moonrise/research/ads/google',
    );
  });

  it('shows an empty state when the org has no brands', () => {
    render(
      <ResearchOrgBrandGate>
        <div>Should not render</div>
      </ResearchOrgBrandGate>,
    );

    expect(
      screen.getByRole('heading', { name: 'Research needs a brand' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to brands' })).toHaveAttribute(
      'href',
      '/acme/~/settings/brands',
    );
  });
});
