import { render, screen } from '@testing-library/react';
import HomeCTA from '@web-components/home/_cta';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      app: 'https://app.genfeed.ai',
    },
  },
}));

describe('HomeCTA', () => {
  it('closes on the agent action first, then the sign-up', () => {
    render(<HomeCTA />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /start with one brief/i,
      }),
    ).toBeInTheDocument();
    expect(
      [...document.querySelectorAll('button, a')].map((link) =>
        link.textContent?.trim(),
      ),
    ).toEqual(['Connect Agent', 'Start creating', 'See pricing']);
    expect(
      screen.getByRole('button', { name: /connect agent/i }),
    ).toHaveAttribute('aria-haspopup', 'dialog');
    expect(
      screen.getByRole('link', { name: /start creating/i }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up');
    expect(screen.getByTestId('home-price-line')).toHaveTextContent(
      'Plans from $39 a month, or pay as you go from $10.',
    );
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
  });
});
