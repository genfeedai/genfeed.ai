// @vitest-environment jsdom

import {
  KnowledgeProcessingState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { normalizeOperationError } from '@services/core/operation-error';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addSheetSubmit: null as null | ((request: unknown) => Promise<void>),
  archive: vi.fn(),
  detailRefresh: null as null | (() => Promise<void>),
  loggerError: vi.fn(),
  refreshSource: vi.fn(),
  capture: vi.fn(),
  notificationError: vi.fn(),
  notificationSuccess: vi.fn(),
  refresh: vi.fn(),
  retry: vi.fn(),
  useKnowledgeLibrary: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@pages/library/knowledge/hooks/use-knowledge-library', () => ({
  useKnowledgeLibrary: (options: unknown) => mocks.useKnowledgeLibrary(options),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token'),
}));

vi.mock('@services/content/knowledge-sources.service', () => ({
  KnowledgeSourcesService: {
    getInstance: () => ({
      archive: mocks.archive,
      capture: mocks.capture,
      retry: mocks.retry,
      refresh: mocks.refreshSource,
    }),
  },
}));

vi.mock('@services/content/knowledge-spaces.service', () => ({
  KnowledgeSpacesService: { getInstance: () => ({ addMember: vi.fn() }) },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationError,
      success: mocks.notificationSuccess,
    }),
  },
}));

vi.mock('./knowledge-add-source-sheet', () => ({
  PURPOSE_OPTIONS: [],
  default: ({
    isOpen,
    onSubmit,
  }: {
    isOpen: boolean;
    onSubmit: (request: unknown) => Promise<void>;
  }) => {
    mocks.addSheetSubmit = isOpen ? onSubmit : null;
    return isOpen ? <div data-testid="add-sheet" /> : null;
  },
}));

vi.mock('./knowledge-source-detail-sheet', () => ({
  default: ({
    row,
    onRefresh,
  }: {
    row: { source: { id: string; title: string } } | null;
    onRefresh: (source: { id: string; title: string }) => Promise<void>;
  }) => {
    mocks.detailRefresh = row ? () => onRefresh(row.source) : null;
    return row ? <div data-testid="detail">{row.source.title}</div> : null;
  },
}));

import KnowledgeSourcesList from './knowledge-sources-list';

function row(
  id: string,
  processingState: KnowledgeProcessingState,
  processingError: string | null = null,
) {
  return {
    source: {
      id,
      kind: KnowledgeSourceKind.URL,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      title: `Source ${id}`,
    },
    spaceIds: [],
    version: {
      id: `${id}-v1`,
      isCurrent: true,
      observedAt: '2026-09-06T10:00:00.000Z',
      processingError,
      processingState,
      retrievalState: 'ACTIVE',
      version: 1,
    },
  };
}

function renderList(
  overrides: Partial<Parameters<typeof KnowledgeSourcesList>[0]> = {},
) {
  return render(
    <KnowledgeSourcesList
      brandId="brand-1"
      isAddOpen={false}
      onAddClose={vi.fn()}
      onSeedHandled={vi.fn()}
      seedRequestId={0}
      {...overrides}
    />,
  );
}

describe('KnowledgeSourcesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshSource.mockReset().mockResolvedValue({});
    mocks.detailRefresh = null;
    mocks.refresh.mockResolvedValue(undefined);
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: [],
      spaces: [],
    });
  });

  it('scopes the load to the active brand and shows the empty state', () => {
    renderList();

    expect(mocks.useKnowledgeLibrary).toHaveBeenCalledWith({
      brandId: 'brand-1',
      page: 1,
    });
    expect(screen.getByText('No knowledge sources yet')).toBeInTheDocument();
  });

  it('renders processing state with the failure reason and retries a failed source', async () => {
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: [
        row('a', KnowledgeProcessingState.READY),
        row('b', KnowledgeProcessingState.FAILED, 'Fetch failed (503)'),
      ],
      spaces: [{ id: 'inbox', isInbox: true, title: 'Inbox' }],
    });
    mocks.retry.mockResolvedValue({ jobId: 'job' });

    renderList();

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Fetch failed (503)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry ingestion' }));
    await waitFor(() =>
      expect(mocks.retry).toHaveBeenCalledWith('b', 'brand-1'),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('captures a new source through the API and closes the sheet', async () => {
    mocks.capture.mockResolvedValue({ jobId: 'job', source: { id: 'new' } });
    const onAddClose = vi.fn();

    renderList({ isAddOpen: true, onAddClose });
    expect(screen.getByTestId('add-sheet')).toBeInTheDocument();
    await act(async () => {
      await mocks.addSheetSubmit?.({
        kind: KnowledgeSourceKind.URL,
        purpose: KnowledgeSourcePurpose.INSPIRATION,
        referenceUrl: 'https://brand.example/pricing',
        scope: 'brand',
        title: 'Pricing',
      });
    });

    await waitFor(() =>
      expect(mocks.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceUrl: 'https://brand.example/pricing',
          title: 'Pricing',
        }),
        'brand-1',
      ),
    );
    expect(onAddClose).toHaveBeenCalled();
    expect(mocks.notificationSuccess).toHaveBeenCalled();
  });

  it('seeds the brand website as a Brand Truth URL source exactly once', async () => {
    mocks.capture.mockResolvedValue({ jobId: 'job', source: { id: 'seed' } });
    const onSeedHandled = vi.fn();

    const view = renderList({
      onSeedHandled,
      seedRequestId: 1,
      website: 'https://brand.example/',
    });
    view.rerender(
      <KnowledgeSourcesList
        brandId="brand-1"
        isAddOpen={false}
        onAddClose={vi.fn()}
        onSeedHandled={onSeedHandled}
        seedRequestId={1}
        website="https://brand.example/"
      />,
    );

    await waitFor(() => expect(onSeedHandled).toHaveBeenCalled());
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith(
      {
        kind: KnowledgeSourceKind.URL,
        purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
        referenceUrl: 'https://brand.example/',
        scope: 'brand',
        title: 'brand.example',
      },
      'brand-1',
    );
  });

  it('surfaces load errors with a retry', () => {
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: 'Knowledge could not be loaded.',
      isLoading: false,
      refresh: mocks.refresh,
      rows: [],
      spaces: [],
    });

    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mocks.refresh).toHaveBeenCalled();
  });
  function showRefreshSource() {
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: [row('a', KnowledgeProcessingState.READY)],
      spaces: [],
    });
    renderList();
    fireEvent.click(screen.getByText('Source a'));
    expect(mocks.detailRefresh).not.toBeNull();
  }
  it('shows an actionable source-specific notice for a normalized 422, reloads, and permits retry', async () => {
    const error = normalizeOperationError('refresh knowledge', {
      response: {
        status: 422,
        data: {
          errors: [
            {
              code: '422',
              title: 'Knowledge source unavailable',
              detail:
                'The source could not be reached. Check its URL and availability, then try again.',
            },
          ],
        },
      },
    });
    expect(error).toMatchObject({
      status: 422,
      category: 'Knowledge source unavailable',
    });
    mocks.refreshSource.mockRejectedValueOnce(error);
    showRefreshSource();
    await act(async () => {
      await mocks.detailRefresh?.();
    });
    expect(mocks.notificationError).toHaveBeenCalledWith(
      'Could not refresh “Source a”. Check the source URL and availability, then try again.',
    );
    expect(mocks.loggerError).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      await mocks.detailRefresh?.();
    });
    expect(mocks.refreshSource).toHaveBeenCalledTimes(2);
    expect(mocks.notificationSuccess).toHaveBeenCalledWith('Refresh queued');
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });
  it.each([
    { status: 500, title: 'Knowledge source unavailable' },
    { status: 422, title: 'Other error' },
  ])(
    'keeps unexpected refresh failures logged and generic: %j',
    async ({ status, title }) => {
      const error = normalizeOperationError('refresh knowledge', {
        response: {
          status,
          data: {
            errors: [
              {
                code: String(status),
                title,
                detail: 'private.invalid failure',
              },
            ],
          },
        },
      });
      mocks.refreshSource.mockRejectedValueOnce(error);
      showRefreshSource();
      await act(async () => {
        await mocks.detailRefresh?.();
      });
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to refresh knowledge source',
        error,
      );
      expect(mocks.notificationError).toHaveBeenCalledWith(
        'Failed to refresh source',
      );
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );
  it('keeps successful refresh notifications and library reload', async () => {
    showRefreshSource();
    await act(async () => {
      await mocks.detailRefresh?.();
    });
    expect(mocks.refreshSource).toHaveBeenCalledWith(
      'a',
      'brand-1',
      expect.stringMatching(/^refresh-a-/),
    );
    expect(mocks.notificationSuccess).toHaveBeenCalledWith('Refresh queued');
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
