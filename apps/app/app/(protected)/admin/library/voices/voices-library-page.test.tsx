import { VoiceProvider } from '@genfeedai/contracts';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const service = {
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
    replace: vi.fn(),
    searchParams: new URLSearchParams(),
  };
});
vi.mock('next-intl', () => ({ useTranslations: () => mocks.translate }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/library/voices',
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => mocks.notifications },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock('@ui/layout/admin-page-shell/AdminPageShell', () => ({
  default: ({
    children,
    dropdowns,
    filters,
    onRefresh,
    primaryAction,
    search,
  }: {
    children: ReactNode;
    dropdowns?: ReactNode;
    filters?: ReactNode;
    onRefresh?: () => void;
    primaryAction?: ReactNode;
    search?: ReactNode;
  }) => (
    <main>
      {search}
      {filters}
      <button aria-label="Refresh" onClick={onRefresh} type="button" />
      {dropdowns}
      {primaryAction}
      {children}
    </main>
  ),
}));
vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));
vi.mock('@services/ingredients/voices.service', () => ({ VoicesService: {} }));
vi.mock('@ui/audio/preview-player/AudioPreviewPlayer', () => ({
  default: ({ label, audioUrl }: { label: string; audioUrl: string }) => (
    <span role="img" aria-label={label} data-url={audioUrl} />
  ),
}));

import VoicesLibraryPage from './voices-library-page';

const voices = Array.from({ length: 15 }, (_, index) => ({
  id: `voice-${index}`,
  name: `Voice ${index}`,
  externalVoiceId: `external-${index}`,
  language: 'en',
  provider: VoiceProvider.ELEVENLABS,
  isActive: true,
  isDefaultSelectable: true,
  isFeatured: false,
  sampleAudioUrl: 'https://example.test/preview.mp3',
}));
const page = (items: unknown[]) => ({
  hasNext: false,
  hasPrevious: false,
  items,
  page: 1,
  pageSize: 15,
  total: items.length,
  totalPages: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.service.findCatalog.mockResolvedValue(page(voices));
  mocks.service.importCatalogVoices.mockResolvedValue({
    created: 0,
    updated: 1,
  });
});

describe('admin voice catalog table', () => {
  it('lists voices as table rows with a preview player and overflow actions', async () => {
    const user = userEvent.setup();
    render(<VoicesLibraryPage />);

    const table = await screen.findByRole('table', { name: 'tableLabel' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'columns.name',
      'columns.provider',
      'columns.externalId',
      'columns.language',
      'columns.status',
      'columns.preview',
      'columns.actions',
    ]);
    expect(within(table).getAllByRole('row')).toHaveLength(voices.length + 1);
    expect(within(table).getByText('external-0')).toBeInTheDocument();
    expect(screen.getByLabelText('Voice 0')).toHaveAttribute(
      'data-url',
      voices[0].sampleAudioUrl,
    );
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();

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

  it('asks the server for the page in the URL', async () => {
    mocks.searchParams = new URLSearchParams('page=3&q=Ada&provider=heygen');
    render(<VoicesLibraryPage />);

    await waitFor(() =>
      expect(mocks.service.findCatalog).toHaveBeenCalledWith(
        { limit: 15, page: 3, provider: 'heygen', search: 'Ada' },
        expect.any(AbortSignal),
      ),
    );
  });

  it('writes search to the URL and resets to the first page', async () => {
    mocks.searchParams = new URLSearchParams('page=3');
    render(<VoicesLibraryPage />);
    await screen.findByRole('table');

    fireEvent.change(screen.getByPlaceholderText('searchPlaceholder'), {
      target: { value: 'Ada' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('searchPlaceholder'), {
      key: 'Enter',
    });

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        '/admin/library/voices?q=Ada',
        { scroll: false },
      ),
    );
  });

  it('syncs one provider from the toolbar dropdown', async () => {
    const user = userEvent.setup();
    render(<VoicesLibraryPage />);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: /syncProvider/ }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'syncElevenLabs' }),
    );
    await waitFor(() =>
      expect(mocks.service.importCatalogVoices).toHaveBeenCalledWith([
        VoiceProvider.ELEVENLABS,
      ]),
    );
  });

  it('has distinct error, retry and empty states', async () => {
    mocks.service.findCatalog
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([]));
    render(<VoicesLibraryPage />);
    expect(await screen.findByText('loadError')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('empty')).toBeInTheDocument();
  });
});
