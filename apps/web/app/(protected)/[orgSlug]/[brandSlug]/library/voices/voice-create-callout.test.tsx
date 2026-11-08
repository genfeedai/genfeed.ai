// @vitest-environment jsdom

import { queryClientWrapper } from '@app-tests/query-client.harness';
import type { ElevenLabsConnectionStatus } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VoiceCreateCallout from './voice-create-callout';

const account = vi.hoisted(() => ({
  heyGen: 'disconnected' as string,
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

vi.mock('@services/ingredients/heygen.service', () => ({
  HeyGenService: {
    getInstance: () => ({
      fetchConnectionStatus: async () => ({
        hasCustomKey: account.heyGen !== 'disconnected',
        isConnected: account.heyGen === 'connected',
        provider: 'heygen',
        state: account.heyGen,
      }),
    }),
  },
}));

function renderCallout(onUploadSample = vi.fn()) {
  render(
    <VoiceCreateCallout
      connectHref="/acme/settings/integrations"
      onUploadSample={onUploadSample}
      recordHref="/acme/main/library/voices/record"
      twinHref="/acme/main/library/avatars/twin"
    />,
    { wrapper: queryClientWrapper() },
  );
  return onUploadSample;
}

describe('VoiceCreateCallout', () => {
  beforeEach(() => {
    account.heyGen = 'disconnected';
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
      screen.queryByRole('link', { name: 'Record my voice' }),
    ).not.toBeInTheDocument();
  });

  it('says when the saved key is rejected', async () => {
    account.status = 'invalid';
    renderCallout();

    expect(
      await screen.findByText('Reconnect your account'),
    ).toBeInTheDocument();
  });

  it('offers recording and file upload once ElevenLabs is connected', async () => {
    account.status = 'connected';
    const onUploadSample = renderCallout();

    expect(
      await screen.findByRole('link', { name: 'Record my voice' }),
    ).toHaveAttribute('href', '/acme/main/library/voices/record');
    fireEvent.click(screen.getByRole('button', { name: 'Upload a sample' }));

    expect(onUploadSample).toHaveBeenCalledOnce();
  });

  it('offers recording with only HeyGen connected', async () => {
    account.heyGen = 'connected';
    renderCallout();

    expect(
      await screen.findByRole('link', { name: 'Record my voice' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Upload a sample' }),
    ).not.toBeInTheDocument();
  });

  it('always links to the digital twin', async () => {
    renderCallout();

    expect(
      await screen.findByRole('link', { name: 'Create my digital twin' }),
    ).toHaveAttribute('href', '/acme/main/library/avatars/twin');
  });
});
