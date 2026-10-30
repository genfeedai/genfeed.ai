import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgentFirstActions from './AgentFirstActions';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'https://app.genfeed.ai' },
  },
}));

describe('AgentFirstActions', () => {
  it('puts the agent action before the SaaS sign-up', () => {
    render(<AgentFirstActions trackingName="research_hero_click" />);

    const links = [...document.querySelectorAll('button, a')];
    expect(links.map((link) => link.textContent)).toEqual([
      'Connect your agent',
      'Start for $0',
    ]);
    expect(links[0]).toHaveAttribute('aria-haspopup', 'dialog');
    expect(links[1]).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up');
  });

  it('never offers a sales demo', () => {
    render(<AgentFirstActions trackingName="research_hero_click" />);

    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
  });

  it('keeps a page-specific sign-up preset and label', () => {
    render(
      <AgentFirstActions
        signUpHref="https://app.genfeed.ai/sign-up?plan=payg"
        signUpLabel="Create now"
        trackingName="research_cta_click"
      />,
    );

    expect(screen.getByRole('link', { name: 'Create now' })).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/sign-up?plan=payg',
    );
  });

  it('tracks the agent action on the shared marketing bridge', () => {
    const listener = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);

    render(<AgentFirstActions trackingName="research_hero_click" />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect your agent' }));

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          trackingData: { action: 'connect_agent' },
          trackingName: 'research_hero_click',
        },
      }),
    );

    window.removeEventListener('genfeed:marketing:button-click', listener);
  });
});
