import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const detect = vi.hoisted(() => vi.fn());
vi.mock('~services/native-host.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~services/native-host.service')>()),
  detectNativeHost: detect,
}));

import { LocalFallbackSettings } from '~components/settings/LocalFallbackSettings';
import { NativeHostError } from '~services/native-host.service';
import { useSettingsStore } from '~store/use-settings-store';

const PROVIDERS = [
  { id: 'claude-cli', isAvailable: true, kind: 'cli', label: 'Claude Code' },
  { id: 'codex-cli', isAvailable: false, kind: 'cli', label: 'Codex CLI' },
  { id: 'openai-api', isAvailable: true, kind: 'api', label: 'OpenAI API key' },
];

describe('LocalFallbackSettings', () => {
  beforeEach(() => {
    detect
      .mockReset()
      .mockResolvedValue({ hostVersion: '0.6.0', providers: PROVIDERS });
    useSettingsStore.setState({ localFallbackProviderId: null });
  });

  afterEach(cleanup);

  it('checks this computer on open and never chooses a provider by itself', async () => {
    render(<LocalFallbackSettings />);

    await screen.findByRole('button', { name: 'Check again' });
    expect(detect).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().localFallbackProviderId).toBeNull();
    expect(
      screen.getByRole('combobox', { name: 'Local fallback' }).textContent,
    ).toContain('Off (Genfeed only)');
  });

  it('explains how to install the bridge when the host is missing, and checks again on demand', async () => {
    detect.mockRejectedValueOnce(
      new NativeHostError(
        'The Genfeed local bridge is not reachable. Run `gf host install`.',
        'unreachable',
      ),
    );
    render(<LocalFallbackSettings />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'gf host install',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await screen.findByText(/Genfeed is always tried first/);
    expect(detect).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('says so when nothing usable was found', async () => {
    detect.mockResolvedValue({
      hostVersion: '0.6.0',
      providers: PROVIDERS.map((provider) => ({
        ...provider,
        isAvailable: false,
      })),
    });
    render(<LocalFallbackSettings />);

    expect(
      await screen.findByText(/No Claude Code, Codex or Gemini CLI/),
    ).toBeTruthy();
  });

  it('warns when the chosen provider is no longer found', async () => {
    useSettingsStore.setState({ localFallbackProviderId: 'codex-cli' });
    render(<LocalFallbackSettings />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Codex CLI was not found on this computer',
    );
  });

  it('does not warn about a chosen provider that is available', async () => {
    useSettingsStore.setState({ localFallbackProviderId: 'claude-cli' });
    render(<LocalFallbackSettings />);

    await screen.findByRole('button', { name: 'Check again' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
