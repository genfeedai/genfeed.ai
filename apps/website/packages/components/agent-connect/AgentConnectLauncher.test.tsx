import { act, render, screen } from '@testing-library/react';
import { AGENT_CONNECT_EVENT } from '@ui/buttons/connect-agent/connect-agent.event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentConnectLauncher from './AgentConnectLauncher';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.genfeed.ai' } },
}));

describe('AgentConnectLauncher', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('renders nothing until an open is requested', () => {
    render(<AgentConnectLauncher />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lazy-loads and opens the dialog on the connect event', async () => {
    render(<AgentConnectLauncher />);

    act(() => {
      window.dispatchEvent(new Event(AGENT_CONNECT_EVENT));
    });

    expect(await screen.findByRole('dialog')).toHaveAccessibleName(
      'Connect your agent',
    );
  });

  it('opens the dialog on first load of the /agent#connect deep link', async () => {
    window.history.replaceState(null, '', '/agent#connect');
    render(<AgentConnectLauncher />);

    expect(await screen.findByRole('dialog')).toHaveAccessibleName(
      'Connect your agent',
    );
  });

  it('opens on a later hashchange to the deep link', async () => {
    render(<AgentConnectLauncher />);

    act(() => {
      window.history.replaceState(null, '', '/agent#connect');
      window.dispatchEvent(new Event('hashchange'));
    });

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
