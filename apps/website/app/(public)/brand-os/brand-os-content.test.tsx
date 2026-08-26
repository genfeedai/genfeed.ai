import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import BrandOSContent from './brand-os-content';

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
  default: () => <footer>Footer</footer>,
}));

describe('BrandOSContent', () => {
  it('renders the source-backed Brand OS promise', () => {
    render(<BrandOSContent />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /turn your website into an ai-readable brand os/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /strategy with receipts/i }),
    ).toBeInTheDocument();
  });

  it('surfaces the core design-system sections', () => {
    render(<BrandOSContent />);

    expect(
      screen.getByRole('heading', { name: /content is the accent/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /depth without borders/i }),
    ).toBeInTheDocument();
  });

  it('renders real DESIGN.md tokens with hex values', () => {
    render(<BrandOSContent />);

    // Background layer token from DESIGN.md
    expect(screen.getByText('bg-primary')).toBeInTheDocument();
    expect(screen.getAllByText('#0A0A0A').length).toBeGreaterThan(0);
    // Platform identifier token from DESIGN.md
    expect(screen.getByText('Discord')).toBeInTheDocument();
  });

  it('keeps one clear primary CTA without adding the anonymous intake flow', () => {
    render(<BrandOSContent />);

    const primaryCta = screen.getByRole('link', {
      name: /build your brand os/i,
    });

    expect(primaryCta).toHaveAttribute('href', '#brand-os-preview');
    expect(primaryCta).toHaveClass('bg-primary');
    expect(
      screen.getByRole('link', { name: /inspect every state/i }),
    ).toHaveClass('bg-tertiary');
    expect(
      screen.getByRole('link', { name: /open the studio/i }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai');
    expect(
      screen.getByRole('link', { name: /back to genfeed\.ai/i }),
    ).toHaveAttribute('href', '/');
    // The intake form was removed — no public website URL field remains.
    expect(screen.queryByLabelText(/public website url/i)).toBeNull();
  });

  it('shows labeled evidence, sources, confidence, and candidate boundaries', () => {
    render(<BrandOSContent />);

    expect(screen.getByText('Confidence: 98%')).toBeInTheDocument();
    expect(screen.getByText('extracted')).toBeInTheDocument();
    expect(screen.getByText('inferred')).toBeInTheDocument();
    expect(screen.getAllByText('candidate').length).toBeGreaterThan(0);
    expect(screen.getByText('missing')).toBeInTheDocument();
    expect(
      screen.getByText(/Exploration only — not Genfeed product tokens/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Current product color tokens remain unchanged/i),
    ).toBeInTheDocument();
  });
});
