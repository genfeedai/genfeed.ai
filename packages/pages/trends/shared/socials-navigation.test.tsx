/* @vitest-environment jsdom */

import { SocialsNavigation } from '@pages/trends/shared/socials-navigation';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scope = vi.hoisted(() => ({ prefix: '/workspace-a/brand-a' }));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `${scope.prefix}${path}` }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
    ...props
  }: {
    children: ReactNode;
    href: string;
    className?: string;
    [key: string]: unknown;
  }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/discovery/trends',
  useRouter: () => ({
    prefetch: vi.fn(),
    push: vi.fn(),
  }),
  useSearchParams: () => ({
    toString: () => '',
  }),
}));

describe('SocialsNavigation', () => {
  beforeEach(() => {
    scope.prefix = '/workspace-a/brand-a';
  });

  it('preserves a different workspace and brand for every platform link', () => {
    scope.prefix = '/workspace-b/brand-b';
    render(<SocialsNavigation active="youtube" />);

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(
        /^\/workspace-b\/brand-b\/discovery\/trends/,
      );
    }
  });
  it('links every platform to its Discovery trends drilldown', () => {
    render(<SocialsNavigation active="overview" />);

    expect(screen.getByRole('link', { name: 'All platforms' })).toHaveAttribute(
      'href',
      '/workspace-a/brand-a/discovery/trends',
    );
    expect(
      screen.queryByRole('link', { name: 'Following' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'href',
      '/workspace-a/brand-a/discovery/trends/platforms/twitter',
    );
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      '/workspace-a/brand-a/discovery/trends/platforms/instagram',
    );
    expect(screen.getByRole('link', { name: 'YouTube' })).toHaveAttribute(
      'href',
      '/workspace-a/brand-a/discovery/trends/platforms/youtube',
    );
    expect(screen.getByRole('link', { name: 'TikTok' })).toHaveAttribute(
      'href',
      '/workspace-a/brand-a/discovery/trends/platforms/tiktok',
    );
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      '/workspace-a/brand-a/discovery/trends/platforms/linkedin',
    );
    expect(screen.getByRole('link', { name: 'Reddit' })).toHaveAttribute(
      'href',
      '/workspace-a/brand-a/discovery/trends/platforms/reddit',
    );
    expect(screen.getByRole('link', { name: 'Pinterest' })).toHaveAttribute(
      'href',
      '/workspace-a/brand-a/discovery/trends/platforms/pinterest',
    );
  });

  it('uses the shared segmented navigation style', () => {
    render(<SocialsNavigation active="overview" />);

    const allPlatforms = screen.getByRole('link', { name: 'All platforms' });
    expect(allPlatforms.className).toMatch(/rounded-md/);
    expect(allPlatforms.className).not.toMatch(/rounded-full/);
    expect(allPlatforms.className).not.toMatch(/border-input/);
  });

  it('marks the all-platforms item as active on the trends page', () => {
    render(<SocialsNavigation active="overview" />);

    expect(screen.getByRole('link', { name: 'All platforms' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByRole('link', { name: 'All platforms' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'data-state',
      'inactive',
    );
    expect(screen.getByRole('link', { name: 'X' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('marks the matching platform item as active on platform pages', () => {
    render(<SocialsNavigation active="twitter" />);

    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'All platforms' })).toHaveAttribute(
      'data-state',
      'inactive',
    );
    expect(
      screen.getByRole('link', { name: 'All platforms' }),
    ).not.toHaveAttribute('aria-current');
  });
});
