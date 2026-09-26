import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import LandingTopbar from './LandingTopbar';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@ui/topbars/logo/TopbarLogo', () => ({
  default: () => <span>Logo</span>,
}));

describe('LandingTopbar', () => {
  it('renders only the primary CTA when no secondary action is given', () => {
    render(<LandingTopbar ctaHref="/sign-up" ctaLabel="Start free" />);

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Start free' })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });

  it('renders the secondary CTA alongside the primary one', () => {
    render(
      <LandingTopbar
        ctaHref="/sign-up"
        ctaLabel="Start free"
        secondaryCtaHref="https://calendly.com/genfeed"
        secondaryCtaLabel="Book a Call"
      />,
    );

    expect(screen.getByRole('link', { name: 'Book a Call' })).toHaveAttribute(
      'href',
      'https://calendly.com/genfeed',
    );
    expect(screen.getByRole('link', { name: 'Start free' })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });
});
