import { formatOutputs, formatPrice } from '@genfeedai/pricing';
import {
  getProPlan,
  getScalePlan,
} from '@helpers/business/pricing/pricing.helper';
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
      screen.getByText(
        /launch pricing \(code earlygenfeed\) — first 12 months, then \$49\/month/i,
      ),
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
      expect(screen.getByText('8,000 credits included')).toBeInTheDocument();
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
    ).toBe('Unlimited seats');
  });
});
