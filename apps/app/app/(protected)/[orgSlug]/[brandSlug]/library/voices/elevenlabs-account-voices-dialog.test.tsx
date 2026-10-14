// @vitest-environment jsdom

import type {
  ElevenLabsAccountVoice,
  ElevenLabsAccountVoicePage,
} from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAccountVoices: vi.fn(),
  importAccountVoice: vi.fn(),
  notificationError: vi.fn(),
  notificationSuccess: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );

  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

// Like the real hook, the service getter keeps its identity across renders.
vi.mock('@hooks/auth/use-authed-service/use-authed-service', async () => {
  const { useCallback } = await import('react');
  return {
    useAuthedService: (factory: (token: string) => unknown) =>
      useCallback(async () => factory('token'), []),
  };
});

// Search is exercised by the service request; skip the debounce delay.
vi.mock('@hooks/utils/use-debounce/use-debounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

vi.mock('@services/ingredients/voices.service', () => ({
  VoicesService: {
    getInstance: () => ({
      findAccountVoices: mocks.findAccountVoices,
      importAccountVoice: mocks.importAccountVoice,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: mocks.notificationError,
      success: mocks.notificationSuccess,
    })),
  },
}));

vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@ui/audio/preview-player/AudioPreviewPlayer', () => ({
  default: ({ label }: { label: string }) => (
    <div data-testid="audio-preview-player">{label}</div>
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import ElevenLabsAccountVoicesDialog from './elevenlabs-account-voices-dialog';

function voice(
  overrides: Partial<ElevenLabsAccountVoice> = {},
): ElevenLabsAccountVoice {
  return {
    availability: 'available',
    category: 'cloned',
    externalVoiceId: 'el-voice-1',
    name: 'Founder clone',
    preview: 'https://elevenlabs.test/preview.mp3',
    restriction: null,
    savedVoiceId: null,
    ...overrides,
  };
}

function page(
  overrides: Partial<ElevenLabsAccountVoicePage> = {},
): ElevenLabsAccountVoicePage {
  return {
    connection: { status: 'connected' },
    hasMore: false,
    nextPageToken: null,
    voices: [voice()],
    ...overrides,
  };
}

function renderDialog(onImported = vi.fn()) {
  render(
    <ElevenLabsAccountVoicesDialog
      connectHref="/demo/~/settings/integrations"
      onClose={vi.fn()}
      onImported={onImported}
    />,
  );
  return { onImported };
}

describe('ElevenLabsAccountVoicesDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends a disconnected organization to Integrations', async () => {
    mocks.findAccountVoices.mockResolvedValue(
      page({ connection: { status: 'disconnected' }, voices: [] }),
    );

    renderDialog();

    expect(
      await screen.findByText('Connect your ElevenLabs account'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Integrations' }),
    ).toHaveAttribute('href', '/demo/~/settings/integrations');
  });

  it('explains a rejected key', async () => {
    mocks.findAccountVoices.mockResolvedValue(
      page({ connection: { status: 'invalid' }, voices: [] }),
    );

    renderDialog();

    expect(
      await screen.findByText('Reconnect your ElevenLabs account'),
    ).toBeInTheDocument();
  });

  it('loads later pages through the next-page token', async () => {
    mocks.findAccountVoices
      .mockResolvedValueOnce(page({ hasMore: true, nextPageToken: 'page-2' }))
      .mockResolvedValueOnce(
        page({
          voices: [voice({ externalVoiceId: 'el-voice-2', name: 'Page two' })],
        }),
      );

    renderDialog();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Load more voices' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Import Page two' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Import Founder clone' }),
    ).toBeInTheDocument();
    expect(mocks.findAccountVoices).toHaveBeenLastCalledWith({
      pageToken: 'page-2',
      search: undefined,
    });
    expect(
      screen.queryByRole('button', { name: 'Load more voices' }),
    ).not.toBeInTheDocument();
  });

  it('imports a voice once and reports the saved reference', async () => {
    const saved = { id: 'voice-imported-1' };
    mocks.findAccountVoices.mockResolvedValue(page());
    mocks.importAccountVoice.mockResolvedValue(saved);

    const { onImported } = renderDialog();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Import Founder clone' }),
    );

    await waitFor(() => {
      expect(mocks.importAccountVoice).toHaveBeenCalledWith('el-voice-1');
      expect(onImported).toHaveBeenCalledWith(saved);
    });
    expect(
      screen.getByRole('button', { name: 'Import Founder clone' }),
    ).toBeDisabled();
    expect(mocks.notificationSuccess).toHaveBeenCalledWith(
      'Founder clone added to your Library',
    );
  });

  it('shows restricted voices without letting them be imported', async () => {
    mocks.findAccountVoices.mockResolvedValue(
      page({
        voices: [
          voice({
            availability: 'restricted',
            restriction: 'Verify this voice in ElevenLabs before using it.',
          }),
        ],
      }),
    );

    renderDialog();

    expect(await screen.findByText('Restricted')).toBeInTheDocument();
    expect(
      screen.getByText('Verify this voice in ElevenLabs before using it.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Import Founder clone' }),
    ).toBeDisabled();
  });

  it('searches the connected account', async () => {
    mocks.findAccountVoices.mockResolvedValue(page());

    renderDialog();
    await screen.findByRole('button', { name: 'Import Founder clone' });

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search your ElevenLabs voices' }),
      { target: { value: 'founder' } },
    );

    await waitFor(() => {
      expect(mocks.findAccountVoices).toHaveBeenLastCalledWith(
        { search: 'founder' },
        expect.any(AbortSignal),
      );
    });
  });
});
