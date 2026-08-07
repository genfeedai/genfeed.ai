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
  usePathname: () => '/discover/overview',
  useRouter: () => ({
    prefetch: vi.fn(),
    push: vi.fn(),
  }),
  useSearchParams: () => ({
    toString: () => '',
  }),
}));

describe('SocialsNavigation', () => {
  it('renders platform menu items only (Following is a Discover sidebar peer)', () => {
    render(<SocialsNavigation active="overview" />);

    expect(screen.getByRole('link', { name: 'All platforms' })).toHaveAttribute(
      'href',
      '/discover/overview',
    );
    expect(
      screen.queryByRole('link', { name: 'Following' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'href',
      '/discover/twitter',
    );
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      '/discover/instagram',
    );
    expect(screen.getByRole('link', { name: 'YouTube' })).toHaveAttribute(
      'href',
      '/discover/youtube',
    );
    expect(screen.getByRole('link', { name: 'TikTok' })).toHaveAttribute(
      'href',
      '/discover/tiktok',
    );
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      '/discover/linkedin',
    );
    expect(screen.getByRole('link', { name: 'Reddit' })).toHaveAttribute(
      'href',
      '/discover/reddit',
    );
    expect(screen.getByRole('link', { name: 'Pinterest' })).toHaveAttribute(
      'href',
      '/discover/pinterest',
    );
  });

  it('uses underline menu rows, not rounded filter pills', () => {
    render(<SocialsNavigation active="overview" />);

    const allPlatforms = screen.getByRole('link', { name: 'All platforms' });
    expect(allPlatforms.className).toMatch(/border-b-2/);
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
