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
        name: /start with one brief\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link').map((link) => link.textContent?.trim()),
    ).toEqual(['Connect your agent', 'Start for $0']);
    expect(
      screen.getByRole('link', { name: /connect your agent/i }),
    ).toHaveAttribute('href', '/agent#connect');
    expect(
      screen.getByRole('link', { name: /start for \$0/i }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up');
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
  });
});
