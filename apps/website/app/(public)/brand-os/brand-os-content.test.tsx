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
  it('renders the Genfeed Brand OS design-system heading', () => {
    render(<BrandOSContent />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /the genfeed brand os/i,
      }),
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
    expect(screen.getAllByText('#050607').length).toBeGreaterThan(0);
    // Platform identifier token from DESIGN.md
    expect(screen.getByText('Discord')).toBeInTheDocument();
  });

  it('links to the studio and back home without a lead-capture form', () => {
    render(<BrandOSContent />);

    expect(
      screen.getByRole('link', { name: /open the studio/i }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai');
    expect(
      screen.getByRole('link', { name: /back to genfeed\.ai/i }),
    ).toHaveAttribute('href', '/');
    // The intake form was removed — no public website URL field remains.
    expect(screen.queryByLabelText(/public website url/i)).toBeNull();
  });
});
