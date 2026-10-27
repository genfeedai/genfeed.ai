import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AffiliatesContent from './affiliates-content';

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

describe('AffiliatesContent', () => {
  it('renders the credit reward the billing code pays', () => {
    render(<AffiliatesContent />);

    expect(
      screen.getByRole('heading', { level: 1, name: /earn credits/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /10% in credits, for 12 months/i }),
    ).toBeInTheDocument();
  });

  it('sends every call to action to the Affiliate Hub in the app', () => {
    render(<AffiliatesContent />);

    const links = screen.getAllByRole('link', {
      name: /get your affiliate link/i,
    });

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute(
        'href',
        'https://app.genfeed.ai/settings/referrals',
      );
    }
  });

  it('does not promise cash, commission or a discount', () => {
    const { container } = render(<AffiliatesContent />);
    const text = container.textContent ?? '';

    expect(text).toMatch(/no cash payouts/i);
    expect(text).toMatch(/no referral discount/i);
    expect(text).not.toMatch(/recurring/i);
    expect(text).not.toMatch(/commission/i);
  });
});
