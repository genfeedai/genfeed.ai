import { render, screen, within } from '@testing-library/react';
import { serviceLandingSlugs } from '@web-components/landing/service-landings.data';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ServiceLandingPage from './ServiceLandingPage';

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

vi.mock('@hooks/ui/use-marketing-entrance', () => ({
  useMarketingEntrance: () => ({ current: null }),
}));

vi.mock('@web-components/home/_footer', () => ({
  default: () => <footer>Footer</footer>,
}));

vi.mock('@web-components/landing/LandingFooter', () => ({
  default: () => <footer>Landing footer</footer>,
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'https://app.genfeed.ai' },
    calendly: 'https://calendly.com/genfeed',
  },
}));

const LANDING_SLUGS = [...serviceLandingSlugs, 'retainer', 'dfy', 'fleet'];

describe('ServiceLandingPage', () => {
  it.each(LANDING_SLUGS)(
    'offers self-serve and a call on /%s, in the hero and the closing CTA',
    (slug) => {
      render(<ServiceLandingPage slug={slug} />);

      const startFree = screen.getAllByRole('link', { name: 'Start free' });
      const bookCall = screen.getAllByRole('link', { name: 'Book a Call' });

      expect(startFree).toHaveLength(2);
      expect(bookCall).toHaveLength(2);
      for (const link of startFree) {
        expect(link).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up');
      }
      for (const link of bookCall) {
        expect(link).toHaveAttribute('href', 'https://calendly.com/genfeed');
      }
    },
  );

  it('renders the X growth page with both paths spelled out', () => {
    render(<ServiceLandingPage slug="x-growth" />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Grow your X account.');
    expect(
      within(document.body).getByText('Self-serve: start free'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Can I run it myself instead of hiring you?'),
    ).toBeInTheDocument();
  });
});
