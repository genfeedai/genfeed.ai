import { render, screen } from '@testing-library/react';
import HomeCTA from '@web-components/home/_cta';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    calendly: 'https://calendly.com/genfeed/demo',
    mcpConnectHref: 'https://app.genfeed.ai/connect',
  },
}));

describe('HomeCTA', () => {
  it('repeats the Connect MCP primary and demo secondary actions', () => {
    render(<HomeCTA />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /give your ai agent a way to ship\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link').map((link) => link.textContent?.trim()),
    ).toEqual(['Connect MCP', 'Book a Demo']);
    expect(screen.getByRole('link', { name: /connect mcp/i })).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/connect',
    );
  });
});
