import {
  AVATAR_CREDIT_COSTS,
  avatarClipCreditRange,
  formatOutputs,
  formatPrice,
  getPlanByTier,
  getScalePlan,
  IMAGE_CREDIT_COSTS,
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

vi.mock('@web-hooks/ui/use-marketing-entrance', () => ({
  useMarketingEntrance: () => ({ current: null }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'https://app.genfeed.test' },
    calendly: 'https://calendly.com/vincent-genfeed/30min',
  },
}));

describe('PricingContent', () => {
  it('shows Pro, Scale and Enterprise side by side, with PAYG in its own block', () => {
    render(<PricingContent />);
    const cards = ['Pro', 'Scale', 'Enterprise'].map((name) =>
      screen.getByLabelText(name),
    );
    expect(cards[0]).toHaveTextContent('$49');
    expect(cards[1]).toHaveTextContent('$499');
    expect(cards[2]).toHaveTextContent('$2,500');
    expect(
      screen.getByRole('heading', { name: 'Pay As You Go' }),
    ).toBeInTheDocument();
    expect(cards[0]).toHaveTextContent(
      'off for 12 months with code EARLYGENFEED',
    );
    expect(cards[1]).not.toHaveTextContent('EARLYGENFEED');
  });

  it('never prints the per-credit price', () => {
    render(<PricingContent />);
    expect(screen.queryByText(/\$0\.01/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/credit/)).not.toBeInTheDocument();
  });

  it('compares the four plans in a table', () => {
    render(<PricingContent />);
    const table = within(screen.getByRole('table', { name: 'Compare plans' }));
    expect(
      table.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual(['Feature', 'Pay As You Go', 'Pro', 'Scale', 'Enterprise']);
    const row = table.getByRole('row', {
      name: /Automation, Messages, Discovery/,
    });
    expect(
      within(row).getByRole('rowheader', {
        name: 'Automation, Messages, Discovery',
      }),
    ).toBeInTheDocument();
    expect(
      [...row.querySelectorAll('td')].map((cell) => cell.textContent),
    ).toEqual(['—', '✓', '✓', '✓']);
  });

  it('promises free credits after onboarding', () => {
    render(<PricingContent />);
    expect(
      screen.getAllByText(/100 free credits after onboarding/).length,
    ).toBeGreaterThan(0);
  });

  it('prices Enterprise, which includes our team making the content, as a from price with a direct booking link', () => {
    render(<PricingContent />);
    const managed = within(screen.getByLabelText('Enterprise'));
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

  it('lists every app on the Pro card', () => {
    render(<PricingContent />);
    const pro = within(screen.getByLabelText('Pro'));
    expect(
      pro.getByText('Automation, Messages, Discovery'),
    ).toBeInTheDocument();
    expect(pro.getByText('5,900 credits included')).toBeInTheDocument();
  });

  it('lists the subscription features on the Scale card', () => {
    render(<PricingContent />);
    const scale = within(screen.getByLabelText('Scale'));
    expect(scale.getByText('Brand model training')).toBeInTheDocument();
    expect(scale.getByText('Higher API limits')).toBeInTheDocument();
  });

  it('uses the tokenized dark card surface for the featured plan', () => {
    render(<PricingContent />);

    expect(screen.getByText('Popular').closest('.gsap-card')).toHaveClass(
      'bg-card',
    );
  });

  it('does not strike through the Scale price', () => {
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
    expect(row).toHaveTextContent('52–160 credits');
    expect(row).not.toHaveTextContent('400 credits');
  });

  it('prices images from the reviewed FLUX.3 rates, not a flat 50 credits', () => {
    render(<PricingContent />);
    const range = screen.getByText('Image (1K–2K)').parentElement;
    const fourK = screen.getByText('Image (4K)').parentElement;

    expect(range).toHaveTextContent(
      `${IMAGE_CREDIT_COSTS.image1kTo2k.minCredits}–${IMAGE_CREDIT_COSTS.image1kTo2k.maxCredits} credits`,
    );
    expect(range).toHaveTextContent('8–17 credits');
    expect(fourK).toHaveTextContent('102 credits');
    expect(screen.queryByText(/^50 credits/)).not.toBeInTheDocument();
  });
});
