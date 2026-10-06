import { getAgentClient } from '@data/agent-clients.data';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AgentClientSetup from './agent-client-setup';

describe('AgentClientSetup', () => {
  it('configures Hermes before authorization and opens its native installer directly', () => {
    render(<AgentClientSetup client={getAgentClient('hermes')} />);
    const install = screen.getByRole('link', { name: 'Add Genfeed to Hermes' });
    expect(install).not.toHaveAttribute('target');
    expect(
      screen.queryByText('hermes mcp login genfeed'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CLI setup' }));
    const setup = screen.getByRole('region');
    const labels = within(setup)
      .getAllByRole('button', { name: /^Copy / })
      .map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Copy ~/.hermes/config.yaml',
      'Copy Authorize Hermes',
    ]);
    expect(within(setup).getByText(/mcp_servers:/)).toBeInTheDocument();
    expect(
      within(setup).getByText('hermes mcp login genfeed'),
    ).toBeInTheDocument();
  });

  it('opens browser connector settings in a new tab', () => {
    render(<AgentClientSetup client={getAgentClient('claude')} />);
    expect(
      screen.getByRole('link', { name: 'Open Claude Customize' }),
    ).toHaveAttribute('target', '_blank');
  });
});
