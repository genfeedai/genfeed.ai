import { act, render, screen, waitFor } from '@testing-library/react';
import { AGENT_CONNECT_EVENT } from '@ui/buttons/connect-agent/connect-agent.event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentConnectLauncher from './AgentConnectLauncher';

const dialogModuleLoaded = vi.hoisted(() => vi.fn());

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.genfeed.ai' } },
}));

// The factory runs only when the module is first imported, so it observes
// whether the launcher defers loading the dialog.
vi.mock('./AgentConnectDialog', async (importOriginal) => {
  dialogModuleLoaded();
  return importOriginal();
});

describe('AgentConnectLauncher', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('does not load the dialog until an open is requested', () => {
    render(<AgentConnectLauncher />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dialogModuleLoaded).not.toHaveBeenCalled();
  });

  it('loads the dialog once and opens it on the connect event', async () => {
    render(<AgentConnectLauncher />);

    act(() => {
      window.dispatchEvent(new Event(AGENT_CONNECT_EVENT));
    });

    expect(
      await screen.findByRole('dialog', {}, { timeout: 30_000 }),
    ).toHaveAccessibleName('Connect your agent');
    expect(dialogModuleLoaded).toHaveBeenCalledTimes(1);
  }, 45_000);

  it('restores focus to the element focused when the open was requested', async () => {
    const opener = document.createElement('button');
    const other = document.createElement('button');
    document.body.append(opener, other);
    opener.focus();
    render(<AgentConnectLauncher />);

    act(() => {
      window.dispatchEvent(new Event(AGENT_CONNECT_EVENT));
      // Focus moves while the chunk is still downloading.
      other.focus();
    });
    await screen.findByRole('dialog', {}, { timeout: 10_000 });
    // Radix listens for Escape on the document, not the window.
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
      );
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await waitFor(() => expect(opener).toHaveFocus());
    opener.remove();
    other.remove();
  });

  it('opens the dialog on first load of the /agent#connect deep link', async () => {
    window.history.replaceState(null, '', '/agent#connect');
    render(<AgentConnectLauncher />);

    expect(
      await screen.findByRole('dialog', {}, { timeout: 10_000 }),
    ).toHaveAccessibleName('Connect your agent');
  });

  it('opens on a later hashchange to the deep link', async () => {
    render(<AgentConnectLauncher />);

    act(() => {
      window.history.replaceState(null, '', '/agent#connect');
      window.dispatchEvent(new Event('hashchange'));
    });

    expect(
      await screen.findByRole('dialog', {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
  });
});
