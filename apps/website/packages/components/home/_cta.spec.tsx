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
  it('closes on the sign-up primary and the demo secondary', () => {
    render(<HomeCTA />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /start with one brief\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link').map((link) => link.textContent?.trim()),
    ).toEqual(['Start creating', 'Book a demo']);
    expect(
      screen.getByRole('link', { name: /start creating/i }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up');
    expect(screen.getByRole('link', { name: /book a demo/i })).toHaveAttribute(
      'href',
      'https://calendly.com/genfeed/demo',
    );
  });
});
