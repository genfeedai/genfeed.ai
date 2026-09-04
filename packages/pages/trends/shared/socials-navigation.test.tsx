/* @vitest-environment jsdom */

import { SocialsNavigation } from '@pages/trends/shared/socials-navigation';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
  usePathname: () => '/discovery/overview',
  useRouter: () => ({
    prefetch: vi.fn(),
    push: vi.fn(),
  }),
  useSearchParams: () => ({
    toString: () => '',
  }),
}));

describe('SocialsNavigation', () => {
  it('renders platform menu items only (Following is a Discovery sidebar peer)', () => {
    render(<SocialsNavigation active="overview" />);

    expect(screen.getByRole('link', { name: 'All platforms' })).toHaveAttribute(
      'href',
      '/discovery/overview',
    );
    expect(
      screen.queryByRole('link', { name: 'Following' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'href',
      '/discovery/twitter',
    );
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      '/discovery/instagram',
    );
    expect(screen.getByRole('link', { name: 'YouTube' })).toHaveAttribute(
      'href',
      '/discovery/youtube',
    );
    expect(screen.getByRole('link', { name: 'TikTok' })).toHaveAttribute(
      'href',
      '/discovery/tiktok',
    );
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      '/discovery/linkedin',
    );
    expect(screen.getByRole('link', { name: 'Reddit' })).toHaveAttribute(
      'href',
      '/discovery/reddit',
    );
    expect(screen.getByRole('link', { name: 'Pinterest' })).toHaveAttribute(
      'href',
      '/discovery/pinterest',
    );
  });

  it('uses the shared outlined navigation style', () => {
    render(<SocialsNavigation active="overview" />);

    const allPlatforms = screen.getByRole('link', { name: 'All platforms' });
    expect(allPlatforms.className).toMatch(/border-input/);
    expect(allPlatforms.className).not.toMatch(/rounded-full/);
  });

  it('marks the all-platforms item as active on the discover overview page', () => {
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
