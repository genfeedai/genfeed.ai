import {
  AVATAR_CREDIT_COSTS,
  avatarClipCreditRange,
  formatOutputs,
  formatPrice,
  getPlanByTier,
  getScalePlan,
} from '@genfeedai/pricing';
import { withSimulatedNumberLocale } from '@shared/localeTestUtils';
import { render, screen, within } from '@testing-library/react';
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
    calendly: 'https://calendly.com/vincent-genfeed/30min',
  },
}));

describe('PricingContent', () => {
  it('shows PAYG, Agencies and Done for you side by side', () => {
    render(<PricingContent />);
    const payg = screen.getByText('$0.01');
    expect(payg.parentElement).toHaveTextContent('$0.01/credit');
    expect(screen.getByText('$499')).toBeInTheDocument();
    expect(screen.getByText('$2,500')).toBeInTheDocument();
    expect(screen.queryByText('Pro')).not.toBeInTheDocument();
    expect(screen.queryByText('EARLYGENFEED')).not.toBeInTheDocument();
  });

  it('promises free credits after onboarding', () => {
    render(<PricingContent />);
    expect(
      screen.getAllByText(/100 free credits after onboarding/).length,
    ).toBeGreaterThan(0);
  });

  it('prices Done for you as a from price with a direct booking link', () => {
    render(<PricingContent />);
    const managed = within(screen.getByLabelText('Done for you'));
    expect(managed.getByText('From')).toBeInTheDocument();
    expect(managed.getByText('$2,500')).toBeInTheDocument();
    expect(
      managed.getByText('+ usage at cost + performance fee per contract'),
    ).toBeInTheDocument();
    expect(
      managed.getByText('Custom LoRA models quoted separately'),
    ).toBeInTheDocument();
    expect(managed.getByRole('link', { name: 'Book a call' })).toHaveAttribute(
      'href',
      'https://calendly.com/vincent-genfeed/30min',
    );
  });

  it('lists the subscription features on the Agencies card', () => {
    render(<PricingContent />);
    const agencies = within(screen.getByLabelText('Agencies'));
    expect(agencies.getByText('Brand model training')).toBeInTheDocument();
    expect(agencies.getByText('API and BYOK')).toBeInTheDocument();
  });

  it('uses the tokenized dark card surface for the featured plan', () => {
    render(<PricingContent />);

    expect(screen.getByText('Popular').closest('.gsap-card')).toHaveClass(
      'bg-card',
    );
  });

  it('does not strike through the Agencies price', () => {
    render(<PricingContent />);

    expect(screen.getByText('$499')).not.toHaveClass('line-through');
  });

  it('formats public pricing numbers deterministically across runtime locales', async () => {
    await withSimulatedNumberLocale('de-DE', async () => {
      await Promise.resolve();
      render(<PricingContent />);

      expect(screen.getByText('$1,000')).toBeInTheDocument();
      expect(screen.getByText('100,000 credits')).toBeInTheDocument();
      expect(screen.getByText('60,000 credits included')).toBeInTheDocument();
    });
  });

  it('keeps shared price formatters deterministic across runtime locales', () => {
    withSimulatedNumberLocale('de-DE', () => {
      expect(formatPrice(1_000_000)).toBe('$1,000,000');
      expect(formatOutputs({ images: 1_000_000 })).toBe('1,000,000 images');
    });
  });

  it('uses explicit subscription qualifiers when included credits are absent', () => {
    const scalePlan = getScalePlan();

    expect(getPriceQualifier({ ...scalePlan, includedCredits: null })).toBe(
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
    expect(getPriceQualifier(getPlanByTier('payg'))).toBe('No monthly fee');
  });

  it('prices the avatar clip from the reviewed HeyGen rates, not a flat per-second guess', () => {
    render(<PricingContent />);
    const { maxCredits, minCredits } = avatarClipCreditRange(4);
    const row = screen.getByText('Avatar clip (4s)').parentElement;

    expect(AVATAR_CREDIT_COSTS.avatar4s).toEqual({ maxCredits, minCredits });
    expect(row).toHaveTextContent(`${minCredits}–${maxCredits} credits`);
    // Photo animation to Avatar V: 52–160 credits, not the old 400.
    expect(row).toHaveTextContent('52–160 credits≈ $0.52–$1.60');
    expect(row).not.toHaveTextContent('400 credits');
  });
});
