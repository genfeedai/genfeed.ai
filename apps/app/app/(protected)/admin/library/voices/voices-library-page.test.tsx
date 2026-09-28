import { VoiceProvider } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const service = {
    getTemplates: vi.fn(),
    findCatalog: vi.fn(),
    patchCatalogVoice: vi.fn(),
    importCatalogVoices: vi.fn(),
  };
  const notifications = { error: vi.fn(), success: vi.fn() };
  const translate = (key: string, values?: Record<string, unknown>) =>
    values?.name ? `${key} ${values.name}` : key;
  return {
    service,
    notifications,
    translate,
    getService: vi.fn(async () => service),
  };
});
vi.mock('next-intl', () => ({ useTranslations: () => mocks.translate }));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => mocks.notifications },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@ui/overview/WorkspaceSurface', () => ({
  WorkspaceSurface: ({
    children,
    title,
  }: {
    children: ReactNode;
    title: string;
  }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

vi.mock('@services/ingredients/voices.service', () => ({ VoicesService: {} }));
vi.mock('@ui/audio/preview-player/AudioPreviewPlayer', () => ({
  default: ({ label, audioUrl }: { label: string; audioUrl: string }) => (
    <span role="img" aria-label={label} data-url={audioUrl} />
  ),
}));

import VoicesLibraryPage from './voices-library-page';

const voices = Array.from({ length: 55 }, (_, index) => ({
  id: `voice-${index}`,
  name: `Voice ${index}`,
  externalVoiceId: `external-${index}`,
  provider: VoiceProvider.ELEVENLABS,
  isActive: true,
  isDefaultSelectable: true,
  isFeatured: false,
  sampleAudioUrl: 'https://example.test/preview.mp3',
}));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.service.findCatalog.mockResolvedValue(voices);
  mocks.service.importCatalogVoices.mockResolvedValue({
    created: 0,
    updated: 1,
  });
});
describe('admin voice collection', () => {
  it('defaults to 55 rows with previews and preserves curation in keyboard overflow', async () => {
    const user = userEvent.setup();
    render(<VoicesLibraryPage />);
    expect(await screen.findByTestId('voices-list')).toBeInTheDocument();
    expect(await screen.findByText('Voice 54')).toBeInTheDocument();
    expect(screen.getByLabelText('Voice 0')).toHaveAttribute(
      'data-url',
      voices[0].sampleAudioUrl,
    );
    expect(
      screen.queryByRole('button', { name: 'feature' }),
    ).not.toBeInTheDocument();
    mocks.service.patchCatalogVoice.mockResolvedValue({
      ...voices[0],
      isFeatured: true,
    });
    const menu = screen.getByRole('button', { name: 'actions Voice 0' });
    menu.focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitem', { name: 'feature' }));
    await waitFor(() =>
      expect(mocks.service.patchCatalogVoice).toHaveBeenCalledWith('voice-0', {
        isFeatured: true,
      }),
    );
    expect(await screen.findByText('featured')).toBeInTheDocument();
  });
  it('preserves search and provider sync and remembers the grid toggle', async () => {
    const user = userEvent.setup();
    const first = render(<VoicesLibraryPage />);
    await screen.findByText('Voice 0');
    fireEvent.change(
      screen.getByPlaceholderText('Search by name or external ID'),
      { target: { value: 'Ada' } },
    );
    await waitFor(() =>
      expect(mocks.service.findCatalog).toHaveBeenLastCalledWith({
        provider: undefined,
        search: 'Ada',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sync ElevenLabs' }));
    await waitFor(() =>
      expect(mocks.service.importCatalogVoices).toHaveBeenCalledWith([
        VoiceProvider.ELEVENLABS,
      ]),
    );
    await user.click(screen.getByRole('radio', { name: 'grid' }));
    expect(screen.getByTestId('voices-grid')).toHaveClass('@container');
    first.unmount();
    render(<VoicesLibraryPage />);
    expect(await screen.findByTestId('voices-grid')).toBeInTheDocument();
  });
  it('has distinct loading, error, retry and empty states', async () => {
    mocks.service.findCatalog
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([]);
    render(<VoicesLibraryPage />);
    expect(screen.getByTestId('list-rows-skeleton')).toBeInTheDocument();
    expect(await screen.findByText('loadError')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(await screen.findByText('empty')).toBeInTheDocument();
  });
});
