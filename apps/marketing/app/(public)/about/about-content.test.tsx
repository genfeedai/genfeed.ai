import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AboutContent from './about-content';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@web-hooks/ui/use-marketing-entrance', () => ({
  useMarketingEntrance: () => ({ current: null }),
}));

vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    description,
    title,
  }: {
    children: ReactNode;
    description: ReactNode;
    title: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

describe('AboutContent', () => {
  it('opens with a one-sentence definition under a single H1', () => {
    render(<AboutContent />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByText(
        /^Genfeed is the content studio you run from your own agent/,
      ),
    ).toBeInTheDocument();
  });

  it('renders every about-page section as an H2', () => {
    render(<AboutContent />);

    for (const name of [
      'What Genfeed does',
      'What makes Genfeed different',
      'Who uses Genfeed',
      'The team behind Genfeed',
      'How Genfeed works',
      'Key facts',
      'Frequently asked questions',
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name }),
      ).toBeInTheDocument();
    }
  });

  it('lists key facts as a crawlable definition list', () => {
    const { container } = render(<AboutContent />);

    const terms = Array.from(container.querySelectorAll('dl dt')).map(
      (term) => term.textContent,
    );

    expect(terms).toEqual(
      expect.arrayContaining([
        'Company name',
        'Founded',
        'Founder',
        'Headquarters',
        'Pricing',
        'Contract terms',
        'Competitors',
        'Social',
      ]),
    );
  });

  it('states every plan in the pricing fact, matching the pricing page', () => {
    const { container } = render(<AboutContent />);

    const terms = Array.from(container.querySelectorAll('dl dt'));
    const pricing = terms.find((term) => term.textContent === 'Pricing');

    expect(pricing?.nextElementSibling?.textContent).toBe(
      'Pay As You Go (free), Pro ($49/month), Scale ($499/month), Enterprise (from $2,500/month). Credits cost $0.01 each on Pay As You Go and less on subscriptions.',
    );
  });

  it('answers the cost question with every plan', () => {
    render(<AboutContent />);

    expect(
      screen.getByText(
        'Pay As You Go is free to join and you pay per output, at one cent per credit. Pro is $49/month, Scale is $499/month, and Enterprise is from $2,500/month.',
      ),
    ).toBeInTheDocument();
  });
});
