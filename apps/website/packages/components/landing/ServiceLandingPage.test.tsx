import { fireEvent, render, screen, within } from '@testing-library/react';
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

const AGENT_LANDING_SLUGS = [
  'founder-content',
  'x',
  'linkedin',
  'instagram',
  'tiktok',
  'youtube',
  'threads',
  'facebook',
  'pinterest',
];
const LANDING_SLUGS = [...serviceLandingSlugs, 'fleet'];

vi.mock('@ui/topbars/logo/TopbarLogo', () => ({
  default: () => <span>Logo</span>,
}));

vi.mock('@web-components/landing/BookingSection', () => ({
  default: () => <section id="book">Booking calendar</section>,
}));

describe('ServiceLandingPage', () => {
  it.each(
    LANDING_SLUGS.filter(
      (slug) => slug !== 'done-for-you' && !AGENT_LANDING_SLUGS.includes(slug),
    ),
  )(
    'offers self-serve first and a call on /%s, in the hero and the closing CTA',
    (slug) => {
      render(<ServiceLandingPage slug={slug} />);

      const startFree = within(screen.getByRole('main')).getAllByRole('link', {
        name: 'Start free',
      });
      const bookCall = within(screen.getByRole('main')).getAllByRole('link', {
        name: 'Book a call',
      });

      expect(startFree).toHaveLength(2);
      expect(bookCall).toHaveLength(2);
      for (const link of startFree) {
        expect(link).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up');
      }
      // Calls are booked on /done-for-you, never straight on Calendly.
      for (const link of bookCall) {
        expect(link).toHaveAttribute('href', '/done-for-you#book');
      }
      expect(screen.queryByText('Booking calendar')).not.toBeInTheDocument();
    },
  );

  it('puts the call first on /done-for-you and closes on the calendar', () => {
    render(<ServiceLandingPage slug="done-for-you" />);

    const heroLinks = screen
      .getAllByRole('link')
      .map((link) => link.textContent?.trim())
      .filter((label) => label === 'Book a call' || label === 'Start free');

    expect(heroLinks.slice(0, 2)).toEqual(['Book a call', 'Start free']);
    for (const link of screen.getAllByRole('link', { name: 'Book a call' })) {
      expect(link).toHaveAttribute('href', '/done-for-you#book');
    }
    expect(screen.getByText('Booking calendar')).toBeInTheDocument();
  });

  it('carries what /services used to: smaller scopes and the focused pages', () => {
    render(<ServiceLandingPage slug="done-for-you" />);

    expect(
      screen.getByRole('heading', { name: 'Setup and training' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Content strategy' }),
    ).toBeInTheDocument();
    for (const href of ['/founder-content', '/fleet', '/x', '/pinterest']) {
      expect(
        screen
          .getAllByRole('link')
          .some((link) => link.getAttribute('href') === href),
      ).toBe(true);
    }
  });

  it('keeps the scope sections off every other landing page', () => {
    render(<ServiceLandingPage slug="founder-content" />);

    expect(screen.queryByText('Smaller scopes')).not.toBeInTheDocument();
  });

  it.each(AGENT_LANDING_SLUGS)(
    'leads /%s with agent connection in the header, hero and closing CTA',
    (slug) => {
      render(<ServiceLandingPage slug={slug} />);
      const header = within(screen.getByRole('banner'));
      const connect = header.getByRole('button', {
        name: 'Connect your agent',
      });
      expect(connect).toHaveAttribute('aria-haspopup', 'dialog');
      expect(connect).not.toHaveAttribute('target', '_blank');
      expect(
        header.getByRole('link', { name: 'Start for $0' }),
      ).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up');
      const body = within(screen.getByRole('main'));
      const actions = [
        ...screen.getByRole('main').querySelectorAll('button, a'),
      ].filter((link) =>
        ['Connect your agent', 'Start for $0'].includes(link.textContent ?? ''),
      );
      expect(actions.map((link) => link.textContent)).toEqual([
        'Connect your agent',
        'Start for $0',
        'Connect your agent',
        'Start for $0',
      ]);
      for (const link of body.getAllByRole('button', {
        name: 'Connect your agent',
      })) {
        expect(link).toHaveAttribute('aria-haspopup', 'dialog');
      }
      expect(
        screen.queryByRole('link', { name: /book a call/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/scoped on a call|before booking|retainer/i),
      ).not.toBeInTheDocument();
      expect(body.getByText(/Connect Codex, Claude/)).toBeInTheDocument();
      expect(body.getByText('01 / Connect')).toBeInTheDocument();
      expect(body.getByText('03 / Review')).toBeInTheDocument();
      expect(body.getByText('Approve before publishing')).toBeInTheDocument();
    },
  );

  it('tracks agent connection with the landing page identity', () => {
    const listener = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);
    render(<ServiceLandingPage slug="x" />);
    const body = within(screen.getByRole('main'));
    fireEvent.click(
      body.getAllByRole('button', { name: 'Connect your agent' })[0],
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          trackingData: { action: 'connect_agent' },
          trackingName: 'x_landing_click',
        },
      }),
    );
    window.removeEventListener('genfeed:marketing:button-click', listener);
  });

  it.each([
    ['linkedin', 'Grow your LinkedIn audience.'],
    ['instagram', 'Grow your Instagram.'],
    ['tiktok', 'Grow your TikTok.'],
    ['youtube', 'Grow your YouTube channel.'],
    ['threads', 'Grow on Threads.'],
    ['facebook', 'Grow your Facebook Page.'],
    ['pinterest', 'Grow your Pinterest traffic.'],
  ])('renders the %s bio-link page headline', (slug, headline) => {
    render(<ServiceLandingPage slug={slug} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      headline,
    );
  });
});
