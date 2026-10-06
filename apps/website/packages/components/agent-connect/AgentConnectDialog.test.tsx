import { getAgentClient } from '@data/agent-clients.data';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ConnectAgentButton from '@ui/buttons/connect-agent/ConnectAgentButton';
import { describe, expect, it, vi } from 'vitest';
import AgentConnectDialog from './AgentConnectDialog';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.genfeed.ai' } },
}));

describe('AgentConnectDialog', () => {
  function open() {
    render(
      <>
        <ConnectAgentButton
          label="Connect your agent"
          trackingName="test_connect_click"
        />
        <AgentConnectDialog />
      </>,
    );
    const launcher = screen.getByRole('button', { name: 'Connect your agent' });
    launcher.focus();
    fireEvent.click(launcher);
    return screen.getByRole('dialog');
  }

  it('opens from the CTA without changing the current URL', () => {
    const url = window.location.href;
    const dialog = open();

    expect(dialog).toHaveAccessibleName('Connect your agent');
    expect(window.location.href).toBe(url);
    expect(
      within(dialog).getAllByRole('button', { name: /^Connect / }),
    ).toHaveLength(7);
    expect(
      within(dialog).queryByRole('link', { name: /setup guide/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the Codex install command and account approval in the same dialog', () => {
    const dialog = open();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Connect OpenAI' }),
    );
    fireEvent.mouseDown(within(dialog).getByRole('tab', { name: 'Codex' }));

    expect(
      within(dialog).getByText('codex plugin marketplace add genfeedai/agent'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Copy Codex plugin' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', {
        name: 'Copy Skills-only alternative',
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Skills-only alternative' }),
    );
    expect(
      within(dialog).getByRole('button', {
        name: 'Copy Skills-only alternative',
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Setup prompt' }),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Copy Setup prompt' }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: '2. Approve and check the connection',
      }),
    );
    expect(
      within(dialog).getByText(/sign in or create your free Genfeed account/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/connected successfully/i),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Connect Claude' }),
    ).toBeInTheDocument();
  });

  it('collapses alternative setup when switching apps', () => {
    const dialog = open();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Connect OpenAI' }),
    );
    fireEvent.mouseDown(within(dialog).getByRole('tab', { name: 'Codex' }));
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Skills-only alternative' }),
    );
    fireEvent.mouseDown(within(dialog).getByRole('tab', { name: 'ChatGPT' }));
    expect(
      within(dialog).queryByRole('button', { name: 'Copy Setup prompt' }),
    ).not.toBeInTheDocument();
    fireEvent.mouseDown(within(dialog).getByRole('tab', { name: 'Codex' }));
    expect(
      within(dialog).getByRole('button', { name: 'Skills-only alternative' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('groups Claude variants and updates the connector and install path when switching apps', () => {
    const dialog = open();
    expect(
      within(dialog).queryByRole('button', { name: 'Connect Claude Code' }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Connect Codex' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Connect Claude' }),
    );
    expect(within(dialog).getAllByRole('tab')).toHaveLength(3);
    expect(
      within(dialog).getByRole('link', { name: 'Open Claude Customize' }),
    ).toHaveAttribute('href', 'https://claude.ai/customize/connectors');
    fireEvent.mouseDown(
      within(dialog).getByRole('tab', { name: 'Claude Cowork' }),
    );
    expect(
      within(dialog).getByText(/Then enable Genfeed in your Cowork task/),
    ).toBeInTheDocument();
    fireEvent.mouseDown(
      within(dialog).getByRole('tab', { name: 'Claude Code' }),
    );
    expect(
      within(dialog).getByText(
        '/plugin install genfeed --marketplace genfeedai/agent',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('link', { name: 'Open Claude Customize' }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText('https://mcp.genfeed.ai/mcp/claude'),
    ).toBeInTheDocument();
  });

  it('lets visitors collapse installation and reveal approval independently', () => {
    const dialog = open();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Connect Claude' }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: '1. Add Genfeed' }),
    );
    expect(
      within(dialog).queryByRole('link', { name: 'Open Claude Customize' }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText(
        /sign in or create your free Genfeed account/i,
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: '2. Approve and check the connection',
      }),
    );
    expect(
      within(dialog).getByText(/sign in or create your free Genfeed account/i),
    ).toBeInTheDocument();
  });

  it('keeps agent navigation available and marks the active family', () => {
    const dialog = open();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Connect Claude' }),
    );
    const agents = within(dialog).getByRole('navigation', { name: 'Agents' });
    expect(within(agents).getAllByRole('button')).toHaveLength(7);
    expect(
      within(agents).getByRole('button', { name: 'Connect Claude' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(dialog).queryByRole('button', { name: 'Choose another agent' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(agents).getByRole('button', { name: 'Connect Cursor' }),
    );
    expect(
      within(agents).getByRole('button', { name: 'Connect Claude' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(agents).getByRole('button', { name: 'Connect Cursor' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(dialog).getByRole('link', { name: 'Add Genfeed to Cursor' }),
    ).toBeInTheDocument();
  });

  it('restores focus to the launcher when closed', async () => {
    const dialog = open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await vi.waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Connect your agent' }),
      ).toHaveFocus(),
    );
  });

  it('keeps browser-only clients free of local shell installation prompts', () => {
    const dialog = open();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Connect Claude' }),
    );
    expect(
      within(dialog).queryByRole('button', {
        name: 'Copy Skills-only alternative',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Copy Setup prompt' }),
    ).not.toBeInTheDocument();
  });

  it('switches directly from Cursor to a chat agent in the persistent agent list', () => {
    const dialog = open();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Connect Cursor' }),
    );
    expect(
      within(dialog).getByRole('link', { name: 'Add Genfeed to Cursor' }),
    ).toHaveAttribute(
      'href',
      getAgentClient('cursor').installation.destination,
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Connect Meta Muse' }),
    );
    expect(
      within(dialog).queryByRole('button', {
        name: 'Copy Paste into Meta Muse',
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Connection prompt' }),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Copy Paste into Meta Muse' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/scoped API key/i),
    ).not.toBeInTheDocument();
  });

  it('opens setup immediately when the visitor is already on a client page', () => {
    const url = window.location.href;
    window.history.replaceState(null, '', '/codex');
    try {
      const dialog = open();
      expect(
        within(dialog).getByText(
          'codex plugin marketplace add genfeedai/agent',
        ),
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Connect Codex' }),
      ).not.toBeInTheDocument();
    } finally {
      window.history.replaceState(null, '', url);
    }
  });

  it('opens legacy agent connection links and preserves dedicated setup anchors', () => {
    const url = window.location.href;
    window.history.replaceState(null, '', '/agent#connect');
    try {
      const first = render(<AgentConnectDialog />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(window.location.hash).toBe('');
      first.unmount();
      window.history.replaceState(null, '', '/claude#connect');
      render(<AgentConnectDialog />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(window.location.hash).toBe('#connect');
    } finally {
      window.history.replaceState(null, '', url);
    }
  });
});
