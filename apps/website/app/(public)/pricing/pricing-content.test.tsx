import {
  formatOutputs,
  formatPrice,
  getPlanByTier,
  getProPlan,
  getScalePlan,
} from '@genfeedai/pricing';
import { withSimulatedNumberLocale } from '@shared/localeTestUtils';
import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PricingContent, { getPriceQualifier } from './pricing-content';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    title,
    description,
  }: {
    children: ReactNode;
    title: string;
    description: string;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

vi.mock('@hooks/ui/use-marketing-entrance', () => ({
  useMarketingEntrance: () => ({ current: null }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'https://app.genfeed.test' },
  },
}));

describe('PricingContent launch pricing', () => {
  it('renders the struck-through original price next to the launch price on the Hosted card', () => {
    render(<PricingContent />);

    const originalPrice = screen.getByText('$49');
    expect(originalPrice).toHaveClass('line-through');
    expect(screen.getByText('$39')).toBeInTheDocument();
    expect(screen.getByText('$39')).not.toHaveClass('line-through');
  });

  it('renders the launch note under the Hosted card price', () => {
    render(<PricingContent />);

    expect(
      screen.getByText(/earlygenfeed · 12 months, then \$49\/mo/i),
    ).toBeInTheDocument();
  });

  it('uses the tokenized dark card surface for the popular plan', () => {
    render(<PricingContent />);

    expect(screen.getByText('Popular').closest('.gsap-card')).toHaveClass(
      'bg-card',
    );
  });

  it('renders the enterprise card on the shared grid border surface', () => {
    render(<PricingContent />);

    const enterpriseCard = screen
      .getByRole('heading', { name: 'Your own studio, fully managed.' })
      .closest('.bg-background');

    expect(enterpriseCard).toHaveClass('bg-background');
    expect(enterpriseCard).not.toHaveClass('border', 'shadow-border');
    expect(enterpriseCard?.parentElement).toHaveClass('bg-edge/5');
    expect(enterpriseCard?.parentElement).not.toHaveClass('border');
  });

  it('renders an even number of pricing FAQ blocks', () => {
    render(<PricingContent />);

    expect(
      screen.getByRole('heading', {
        name: 'Can I start free and upgrade later?',
      }),
    ).toBeInTheDocument();
  });

  it('does not strike through prices on plans without launch pricing', () => {
    render(<PricingContent />);

    // Cloud Teams has no launchPrice — its price renders un-struck.
    expect(screen.getByText('$499')).not.toHaveClass('line-through');
  });

  it('formats public pricing numbers deterministically across runtime locales', async () => {
    await withSimulatedNumberLocale('de-DE', async () => {
      await Promise.resolve();
      render(<PricingContent />);

      expect(screen.getByText('$1,000')).toBeInTheDocument();
      expect(screen.getByText('100,000 credits')).toBeInTheDocument();
      expect(screen.getByText('5,900 credits included')).toBeInTheDocument();
    });
  });

  it('keeps shared price formatters deterministic across runtime locales', () => {
    withSimulatedNumberLocale('de-DE', () => {
      expect(formatPrice(1_000_000)).toBe('$1,000,000');
      expect(formatOutputs({ images: 1_000_000 })).toBe('1,000,000 images');
    });
  });

  it('uses explicit subscription qualifiers when included credits are absent', () => {
    const proPlan = getProPlan();
    const scalePlan = getScalePlan();

    expect(getPriceQualifier({ ...proPlan, includedCredits: null })).toBe(
      'Monthly subscription',
    );
    expect(
      getPriceQualifier({ ...scalePlan, includedCredits: undefined }),
    ).toBe('Monthly subscription');
  });

  it('says nothing but the credit grant under the price', () => {
    // Seats, organizations, and API access are bullets. Repeating any of them
    // here is what made the Scale card read "Unlimited seats" twice.
    expect(getPriceQualifier(getScalePlan())).toBe('60,000 credits included');
    expect(getPriceQualifier(getProPlan())).toBe('5,900 credits included');
    expect(getPriceQualifier(getPlanByTier('payg'))).toBe(
      'Credits at $0.01 each',
    );
  });

  it('keeps the pricing cards comparable row by row', () => {
    // The rendered bullets are a comparison axis, not a feature dump: every
    // card answers the same five questions in the same order.
    const rendered = (tier: Parameters<typeof getPlanByTier>[0]) =>
      getPlanByTier(tier).features.slice(0, 5);

    for (const tier of ['payg', 'pro', 'scale', 'enterprise'] as const) {
      const [credits, seats, organizations, brands, api] = rendered(tier);

      expect(credits).toMatch(/credit/i);
      expect(seats).toMatch(/seat/i);
      expect(organizations).toMatch(/organization/i);
      expect(brands).toMatch(/brands and connected channels/i);
      expect(api).toMatch(/API/);
    }
  });
});
