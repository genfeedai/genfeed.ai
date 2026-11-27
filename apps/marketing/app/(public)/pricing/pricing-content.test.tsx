import {
  AVATAR_CREDIT_COSTS,
  avatarClipCreditRange,
  formatOutputs,
  formatPrice,
  getLaunchPrice,
  getLaunchPriceTerm,
  getPlanByTier,
  getScalePlan,
  IMAGE_CREDIT_COSTS,
} from '@genfeedai/pricing';
import { withSimulatedNumberLocale } from '@shared/localeTestUtils';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PricingContent, { getPriceQualifier } from './pricing-content';

// Wraps the real launch helpers so one test can retire the promotion.
vi.mock('@genfeedai/pricing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/pricing')>();

  return {
    ...actual,
    getLaunchPrice: vi.fn(actual.getLaunchPrice),
    getLaunchPriceTerm: vi.fn(actual.getLaunchPriceTerm),
  };
});

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
    bookingUrl: 'https://calendar.app.google/S2Crg8uCe1dVnWRN6',
  },
}));

describe('PricingContent', () => {
  it('shows Pro, Scale and Done for you side by side, with PAYG in its own block', () => {
    render(<PricingContent />);
    const cards = ['Pro', 'Scale', 'Done for you'].map((name) =>
      screen.getByLabelText(name),
    );
    expect(cards[0]).toHaveTextContent('$39');
    expect(cards[1]).toHaveTextContent('$499');
    expect(cards[2]).toHaveTextContent('$2,500');
    expect(
      screen.getByRole('heading', { name: 'Pay As You Go' }),
    ).toBeInTheDocument();
    expect(cards[0]).not.toHaveTextContent('EARLYGENFEED');
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
    ).toEqual(['Feature', 'Pay As You Go', 'Pro', 'Scale', 'Done for you']);
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

  it('prints the sign-up gift, the card grant and the expiry, not their sum', () => {
    render(<PricingContent />);
    const grants =
      '25 credits when you sign up, 75 more when you add a card. Free credits last 72 hours.';

    // The Pay As You Go strip and the "Is there a free trial?" FAQ answer.
    expect(screen.getAllByText(new RegExp(grants)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/100 free credits/)).not.toBeInTheDocument();
  });

  it('prices Done for you, which includes our team making the content, as a from price with a direct booking link', () => {
    render(<PricingContent />);
    const managed = within(screen.getByLabelText('Done for you'));
    expect(managed.getByText('From')).toBeInTheDocument();
    expect(managed.getByText('$2,500')).toBeInTheDocument();
    expect(managed.queryByText(/performance fee per contract/)).toBeNull();
    expect(managed.getByText('Usage billed at cost')).toBeInTheDocument();
    expect(
      managed.getByText('Fee only on winning creatives'),
    ).toBeInTheDocument();
    expect(
      managed.getByText('Custom LoRA quoted separately'),
    ).toBeInTheDocument();
    expect(managed.getByRole('link', { name: 'Book a call' })).toHaveAttribute(
      'href',
      'https://calendar.app.google/S2Crg8uCe1dVnWRN6',
    );
  });

  it('lists every app on the Pro card', () => {
    render(<PricingContent />);
    const pro = within(screen.getByLabelText('Pro'));
    expect(
      pro.getByText('Automation, Messages, Discovery'),
    ).toBeInTheDocument();
    expect(pro.getByText('4,900 credits included')).toBeInTheDocument();
    expect(pro.getAllByRole('listitem')[0]).toHaveTextContent(
      '4,900 credits included',
    );
    expect(pro.getByText('Bring your own key')).toBeInTheDocument();
  });

  it('lists the subscription features on the Scale card', () => {
    render(<PricingContent />);
    const scale = within(screen.getByLabelText('Scale'));
    expect(
      scale.getByText('Ultra quality, model training'),
    ).toBeInTheDocument();
    expect(scale.getByText('600 API requests/min')).toBeInTheDocument();
  });

  it.each([
    [
      'Pro',
      [
        '4,900 credits included',
        'Automation, Messages, Discovery',
        'Bring your own key',
        'Unlimited brands and channels',
        '300 API requests/min',
      ],
    ],
    [
      'Scale',
      [
        '70,000 credits included',
        'Everything in Pro',
        'Unlimited seats and workspaces',
        'Ultra quality, model training',
        '600 API requests/min',
      ],
    ],
    [
      'Done for you',
      [
        'Everything in Scale',
        'We run production, publishing',
        'Usage billed at cost',
        'Fee only on winning creatives',
        'Custom LoRA quoted separately',
      ],
    ],
  ])('shows the same five one-line bullets on the %s card', (name, bullets) => {
    render(<PricingContent />);
    const items = within(screen.getByLabelText(name)).getAllByRole('listitem');

    expect(items.map((item) => item.textContent)).toEqual(bullets);
  });

  it('names no Enterprise promise the product does not deliver', () => {
    const { container } = render(<PricingContent />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/\bSSO\b/);
    expect(text).not.toMatch(/white-label/i);
    expect(text).not.toMatch(/99\.9/);
    expect(text).not.toMatch(/\bSLA\b/);
  });

  it('uses the tokenized dark card surface for the featured plan', () => {
    render(<PricingContent />);

    expect(screen.getByText('Popular').closest('.gsap-card')).toHaveClass(
      'bg-card',
    );
  });

  it.each([
    ['Pro', 'Start Pro', 'pro'],
    ['Scale', 'Start Scale', 'scale'],
    ['Done for you', 'Book a call', 'done_for_you'],
  ])(
    'sends one pricing_plan_click event carrying the plan from the %s card',
    (card, buttonName, plan) => {
      const listener = vi.fn();
      window.addEventListener('genfeed:marketing:button-click', listener);
      render(<PricingContent />);

      fireEvent.click(
        within(screen.getByLabelText(card)).getByRole('link', {
          name: buttonName,
        }),
      );

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].detail).toEqual({
        trackingData: { plan },
        trackingName: 'pricing_plan_click',
      });
      window.removeEventListener('genfeed:marketing:button-click', listener);
    },
  );

  it('sends one pricing_plan_click event carrying payg from the Pay As You Go button', () => {
    const listener = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);
    render(<PricingContent />);

    fireEvent.click(
      screen.getByRole('link', {
        name: getPlanByTier('payg').cta || 'Get Started',
      }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({
      trackingData: { plan: 'payg' },
      trackingName: 'pricing_plan_click',
    });
    window.removeEventListener('genfeed:marketing:button-click', listener);
  });

  it('shows Pro at the launch price with the full price crossed out', () => {
    render(<PricingContent />);
    const pro = within(screen.getByLabelText('Pro'));

    expect(pro.getByText('$49').tagName).toBe('DEL');
    expect(pro.getByText('$39')).not.toHaveClass('line-through');
    expect(pro.queryByText(/EARLYGENFEED/)).not.toBeInTheDocument();
  });

  it('states the 12-month term of the Pro launch price in a tooltip on $39', async () => {
    render(<PricingContent />);
    const pro = within(screen.getByLabelText('Pro'));

    // Keyboard focus always follows a key press (Tab).
    fireEvent.keyDown(document.body, { key: 'Tab' });
    fireEvent.focus(pro.getByText('$39'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '12 months at $39, then $49',
    );
  });

  it('adds no line under the Pro price for the term', () => {
    render(<PricingContent />);
    const pro = within(screen.getByLabelText('Pro'));

    expect(pro.queryByText(/12 months/)).not.toBeInTheDocument();
  });

  it('states the 12-month term of the Pro launch price in the FAQ', () => {
    render(<PricingContent />);

    expect(
      screen.getByText('How long does the Pro launch price last?'),
    ).toBeInTheDocument();
    expect(screen.getByText('12 months at $39, then $49.')).toBeInTheDocument();
  });

  describe('once the launch promotion is retired', () => {
    afterEach(() => {
      vi.mocked(getLaunchPrice).mockRestore();
      vi.mocked(getLaunchPriceTerm).mockRestore();
    });

    it('shows Pro at the full price with no term anywhere', () => {
      vi.mocked(getLaunchPrice).mockReturnValue(null);
      vi.mocked(getLaunchPriceTerm).mockReturnValue(null);
      render(<PricingContent />);
      const pro = within(screen.getByLabelText('Pro'));

      expect(pro.getByText('$49').tagName).not.toBe('DEL');
      expect(pro.queryByText('$39')).not.toBeInTheDocument();
      expect(screen.queryByText(/launch price/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/12 months/)).not.toBeInTheDocument();
    });
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
      expect(screen.getByText('70,000 credits included')).toBeInTheDocument();
      expect(screen.getByText('4,900 credits included')).toBeInTheDocument();
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
    expect(getPriceQualifier(getScalePlan())).toBe('70,000 credits included');
    expect(getPriceQualifier(getPlanByTier('payg'))).toBe('No monthly fee');
  });

  it('prices the avatar clip from the reviewed HeyGen rates, not a flat per-second guess', () => {
    render(<PricingContent />);
    const { maxCredits, minCredits } = avatarClipCreditRange(4);
    const row = screen.getByText('Avatar clip (4s)').parentElement;

    expect(AVATAR_CREDIT_COSTS.avatar4s).toEqual({ maxCredits, minCredits });
    expect(row).toHaveTextContent(`${minCredits}–${maxCredits} credits`);
    // Photo animation to Avatar 6 at 2K: 52–183 credits, not the old 400.
    expect(row).toHaveTextContent('52–183 credits');
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
  it('states how long unposted videos are stored on each plan', () => {
    render(<PricingContent />);
    const cells = within(
      screen.getByRole('rowheader', { name: 'Unposted video storage' })
        .parentElement as HTMLElement,
    ).getAllByRole('cell');

    // Pay-as-you-go, Pro, Scale, Enterprise.
    expect(cells.map((cell) => cell.textContent)).toEqual([
      '7 days',
      '30 days',
      '30 days',
      '30 days',
    ]);
    expect(
      screen.getByText(/Videos you have not posted are kept for 7 days/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /attached only to a draft, cancelled, or skipped post is not kept/,
      ),
    ).toBeInTheDocument();
  });
});
