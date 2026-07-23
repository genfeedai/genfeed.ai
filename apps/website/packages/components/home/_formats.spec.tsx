import { render, screen } from '@testing-library/react';
import HomeFormats from '@web-components/home/_formats';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      app: 'https://app.genfeed.ai',
    },
  },
}));

describe('HomeFormats', () => {
  it('renders the section heading and primary CTA', () => {
    render(<HomeFormats />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /every format your channels need, from one brief\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /generate an asset/i }),
    ).toBeInTheDocument();
  });

  it('lists every output format', () => {
    render(<HomeFormats />);

    for (const title of [
      'Images & posts',
      'Reels & short video',
      'Ad creatives',
      'Avatar clips',
      'Voiceovers',
      'Articles & SEO',
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: title }),
      ).toBeInTheDocument();
    }
  });

  it('shows per-output credit pricing derived from the pricing helper', () => {
    render(<HomeFormats />);

    // Each tile surfaces a "from N credits" label and a "≈ $X" PAYG estimate.
    expect(screen.getAllByText(/from [\d,]+ credits/i).length).toBe(6);
    expect(screen.getAllByText(/≈ \$\d/).length).toBe(6);
  });
});
