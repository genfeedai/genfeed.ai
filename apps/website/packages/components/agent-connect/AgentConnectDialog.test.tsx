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
    fireEvent.click(screen.getByRole('button', { name: 'Connect your agent' }));
    return screen.getByRole('dialog');
  }

  it('opens from the CTA without changing the current URL', () => {
    const url = window.location.href;
    const dialog = open();

    expect(dialog).toHaveAccessibleName('Connect your agent');
    expect(window.location.href).toBe(url);
    expect(
      within(dialog).getAllByRole('button', { name: /^Connect / }),
    ).toHaveLength(11);
    expect(
      within(dialog).queryByRole('link', { name: /setup guide/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the Codex install command and account approval in the same dialog', () => {
    const dialog = open();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Connect Codex' }),
    );

    expect(
      within(dialog).getByText('codex plugin marketplace add genfeedai/agent'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Copy Codex plugin' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Copy Install skills' }),
    ).toBeInTheDocument();
    expect(
      [...dialog.querySelectorAll('code')].map((code) => code.textContent),
    ).toContain(getAgentClient('codex').setupPrompt);
    expect(
      within(dialog).getByText(/sign in or create your free Genfeed account/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/connected successfully/i),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Choose another agent' }),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Connect Claude' }),
    ).toBeInTheDocument();
  });

  it('keeps browser-only clients free of local shell installation prompts', () => {
    const dialog = open();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Connect Claude' }),
    );
    expect(
      within(dialog).queryByRole('button', { name: 'Copy Install skills' }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Copy Setup prompt' }),
    ).not.toBeInTheDocument();
  });

  it('gives Cursor the real install destination and chat agents their connection prompt', () => {
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
      within(dialog).getByRole('button', { name: 'Choose another agent' }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Connect Meta Muse' }),
    );
    expect(
      [...dialog.querySelectorAll('code')].map((code) => code.textContent),
    ).toContain(getAgentClient('muse').chatPrompt);
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
