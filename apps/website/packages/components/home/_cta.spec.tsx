import { render, screen } from '@testing-library/react';
import HomeCTA from '@web-components/home/_cta';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      app: 'https://app.genfeed.ai',
    },
    calendly: 'https://calendly.com/genfeed/demo',
    mcpConnectHref: 'https://app.genfeed.ai/connect',
  },
}));

describe('HomeCTA', () => {
  it('repeats the Start for free primary and demo secondary actions', () => {
    render(<HomeCTA />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /ship on-brand content, faster\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link').map((link) => link.textContent?.trim()),
    ).toEqual(['Start for free', 'Book a Demo']);
    expect(
      screen.getByRole('link', { name: /start for free/i }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up');
  });
});
