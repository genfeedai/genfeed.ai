// @vitest-environment jsdom

import { queryClientWrapper } from '@app-tests/query-client.harness';
import type { ElevenLabsConnectionStatus } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VoiceCreateCallout from './voice-create-callout';

const account = vi.hoisted(() => ({
  status: 'disconnected' as string,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', async () => {
  const { useCallback } = await import('react');
  return {
    useAuthedService: (factory: (token: string) => unknown) =>
      useCallback(async () => factory('token'), []),
  };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@services/ingredients/voices.service', () => ({
  VoicesService: {
    getInstance: () => ({
      findAccountVoices: async () => ({
        connection: { status: account.status as ElevenLabsConnectionStatus },
        hasMore: false,
        nextPageToken: null,
        voices: [],
      }),
    }),
  },
}));

function renderCallout(onCloneVoice = vi.fn()) {
  render(
    <VoiceCreateCallout
      connectHref="/acme/settings/integrations"
      onCloneVoice={onCloneVoice}
      twinHref="/acme/main/library/avatars/twin"
    />,
    { wrapper: queryClientWrapper() },
  );
  return onCloneVoice;
}

describe('VoiceCreateCallout', () => {
  beforeEach(() => {
    account.status = 'disconnected';
  });

  it('asks to connect an account instead of cloning on the platform', async () => {
    renderCallout();

    expect(
      await screen.findByText('Connect your account to create your voices'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Connect your account' }),
    ).toHaveAttribute('href', '/acme/settings/integrations');
    expect(
      screen.queryByRole('button', { name: 'Clone my voice' }),
    ).not.toBeInTheDocument();
  });

  it('says when the saved key is rejected', async () => {
    account.status = 'invalid';
    renderCallout();

    expect(
      await screen.findByText('Reconnect your ElevenLabs account'),
    ).toBeInTheDocument();
  });

  it('offers cloning once the account is connected', async () => {
    account.status = 'connected';
    const onCloneVoice = renderCallout();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Clone my voice' }),
    );

    expect(onCloneVoice).toHaveBeenCalledOnce();
    expect(
      screen.getByText(/created in your own ElevenLabs account/),
    ).toBeInTheDocument();
  });

  it('always links to the digital twin', async () => {
    renderCallout();

    expect(
      await screen.findByRole('link', { name: 'Create my digital twin' }),
    ).toHaveAttribute('href', '/acme/main/library/avatars/twin');
  });
});
