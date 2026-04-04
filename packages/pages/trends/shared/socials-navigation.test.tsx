/* @vitest-environment jsdom */

import { SocialsNavigation } from '@pages/trends/shared/socials-navigation';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
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
  useSearchParams: () => ({
    toString: () => '',
  }),
}));

describe('SocialsNavigation', () => {
  it('renders all expected tab links', () => {
    render(<SocialsNavigation active="overview" />);

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/research/socials',
    );
    expect(screen.getByRole('tab', { name: 'X' })).toHaveAttribute(
      'href',
      '/research/twitter',
    );
    expect(screen.getByRole('tab', { name: 'Instagram' })).toHaveAttribute(
      'href',
      '/research/instagram',
    );
    expect(screen.getByRole('tab', { name: 'YouTube' })).toHaveAttribute(
      'href',
      '/research/youtube',
    );
    expect(screen.getByRole('tab', { name: 'TikTok' })).toHaveAttribute(
      'href',
      '/research/tiktok',
    );
    expect(screen.getByRole('tab', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      '/research/linkedin',
    );
    expect(screen.getByRole('tab', { name: 'Reddit' })).toHaveAttribute(
      'href',
      '/research/reddit',
    );
    expect(screen.getByRole('tab', { name: 'Pinterest' })).toHaveAttribute(
      'href',
      '/research/pinterest',
    );
  });

  it('marks the overview tab as active on the socials landing page', () => {
    render(<SocialsNavigation active="overview" />);

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'X' })).toHaveAttribute(
      'data-state',
      'inactive',
    );
    expect(screen.getByRole('tab', { name: 'X' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('marks the matching platform tab as active on platform pages', () => {
    render(<SocialsNavigation active="twitter" />);

    expect(screen.getByRole('tab', { name: 'X' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByRole('tab', { name: 'X' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'data-state',
      'inactive',
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
