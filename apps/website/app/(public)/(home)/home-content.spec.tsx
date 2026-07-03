import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import HomeContent from './home-content';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
  }) => (
    <span
      aria-label={props.alt ?? ''}
      data-src={typeof props.src === 'string' ? props.src : undefined}
      role="img"
    />
  ),
}));

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

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      app: 'https://app.genfeed.ai',
    },
  },
}));

vi.mock('@web-components/home/_footer', () => ({
  default: () => <footer data-testid="home-footer" />,
}));

vi.mock('@helpers/business/pricing/pricing.helper', () => ({
  websitePlans: [
    {
      cta: 'Start Cloud App',
      ctaHref: '',
      description: 'Managed Genfeed for founders and creators.',
      features: [
        'Everything generated',
        'Managed models',
        'PAYG output',
        'No infra',
      ],
      label: 'Hosted',
      price: 20,
      type: 'payg',
      valueProposition: 'Managed Genfeed for founders.',
    },
    {
      cta: 'Talk to Sales',
      ctaHref: 'https://calendly.com/genfeed/teams',
      description: 'Seats, approvals, multi-org.',
      features: ['Paid seats', 'Approvals', 'Multi-org', 'Managed billing'],
      label: 'Cloud Teams',
      price: 99,
      type: 'subscription',
      valueProposition: 'Scale into a content operation.',
    },
    {
      cta: 'Contact Us',
      ctaHref: 'https://calendly.com/genfeed/enterprise',
      description: 'Custom rollout and governance.',
      features: ['SSO', 'Dedicated support', 'Custom SLA', 'Security review'],
      label: 'Enterprise',
      price: null,
      type: 'subscription',
      valueProposition: 'For regulated content teams.',
    },
  ],
}));

describe('HomeContent', () => {
  it('renders a single hero H1 with the primary hero CTAs', () => {
    render(<HomeContent />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByText('Generate everything you publish.'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: /start cloud app/i }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole('link', { name: /see formats/i }),
    ).toBeInTheDocument();
  });

  it('renders the generated output wall', () => {
    render(<HomeContent />);

    expect(screen.getByTestId('home-hero-output-wall')).toBeInTheDocument();
  });

  it('renders the pricing section with all three plans', () => {
    render(<HomeContent />);

    expect(
      screen.getByText('Pay for access. Then pay for what you create.'),
    ).toBeInTheDocument();
    expect(screen.getByText('$20')).toBeInTheDocument();
    expect(screen.getByText('$99')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('renders the final CTA and shared footer', () => {
    render(<HomeContent />);

    expect(screen.getByText('Start with the cloud app.')).toBeInTheDocument();
    expect(screen.getByTestId('home-footer')).toBeInTheDocument();
  });
});
