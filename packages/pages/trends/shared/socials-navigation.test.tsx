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
  usePathname: () => '/research/socials',
  useRouter: () => ({
    prefetch: vi.fn(),
    push: vi.fn(),
  }),
  useSearchParams: () => ({
    toString: () => '',
  }),
}));

describe('SocialsNavigation', () => {
  it('renders all expected tab links', () => {
    render(<SocialsNavigation active="overview" />);

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/research/socials',
    );
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'href',
      '/research/twitter',
    );
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      '/research/instagram',
    );
    expect(screen.getByRole('link', { name: 'YouTube' })).toHaveAttribute(
      'href',
      '/research/youtube',
    );
    expect(screen.getByRole('link', { name: 'TikTok' })).toHaveAttribute(
      'href',
      '/research/tiktok',
    );
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      '/research/linkedin',
    );
    expect(screen.getByRole('link', { name: 'Reddit' })).toHaveAttribute(
      'href',
      '/research/reddit',
    );
    expect(screen.getByRole('link', { name: 'Pinterest' })).toHaveAttribute(
      'href',
      '/research/pinterest',
    );
  });

  it('marks the overview tab as active on the socials landing page', () => {
    render(<SocialsNavigation active="overview" />);

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
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

  it('marks the matching platform tab as active on platform pages', () => {
    render(<SocialsNavigation active="twitter" />);

    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'data-state',
      'inactive',
    );
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
