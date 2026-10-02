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
  authEpoch: 0,
  tokenWait: null as Promise<void> | null,
  search: '',
  replace: vi.fn(),
  useRealPanel: false,
  addSheetSubmit: null as null | ((request: unknown) => Promise<void>),
  archive: vi.fn(),
  detailArchive: null as null | (() => Promise<void>),
  detailClose: null as null | (() => void),
  detailRefresh: null as null | (() => Promise<void>),
  loggerError: vi.fn(),
  refreshSource: vi.fn(),
  capture: vi.fn(),
  notificationError: vi.fn(),
  notificationSuccess: vi.fn(),
  refresh: vi.fn(),
  retry: vi.fn(),
  reveal: vi.fn(),
  useKnowledgeLibrary: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/ui/context-sidebar-context', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@contexts/ui/context-sidebar-context')
    >();
  return {
    ...actual,
    useContextSidebar: () => {
      const context = actual.useContextSidebar();
      return mocks.useRealPanel ? context : { reveal: mocks.reveal };
    },
  };
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
  usePathname: () => '/org/brand/settings/knowledge',
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@pages/library/knowledge/hooks/use-knowledge-library', () => ({
  useKnowledgeLibrary: (options: unknown) => mocks.useKnowledgeLibrary(options),
}));

const getters = new Map<string, () => Promise<unknown>>();
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const key = `${mocks.authEpoch}:${factory.toString()}`;
    if (!getters.has(key))
      getters.set(key, async () => {
        await mocks.tokenWait;
        return factory('token');
      });
    return getters.get(key);
  },
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

vi.mock('./knowledge-source-detail-panel', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./knowledge-source-detail-panel')>();
  return {
    default: (props: Parameters<typeof actual.default>[0]) => {
      if (mocks.useRealPanel) return <actual.default {...props} />;
      const { row, onArchive, onClose, onRefresh } = props;
      mocks.detailArchive = row ? () => onArchive(row.source) : null;
      mocks.detailClose = row ? onClose : null;
      mocks.detailRefresh =
        row && onRefresh ? () => onRefresh(row.source) : null;
      return row ? (
        <div data-testid="detail">Detail {row.source.title}</div>
      ) : null;
    },
  };
});

import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import KnowledgeSourcesList from './knowledge-sources-list';

function row(
  id: string,
  processingState: KnowledgeProcessingState,
  processingError: string | null = null,
) {
  return {
    source: {
      id,
      isVisible: true,
      isRefreshEnabled: false,
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
    getters.clear();
    mocks.authEpoch = 0;
    mocks.tokenWait = null;
    mocks.search = '';
    mocks.useRealPanel = false;
    mocks.refreshSource.mockReset().mockResolvedValue({});
    mocks.detailArchive = null;
    mocks.detailClose = null;
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
      selectedSourceId: undefined,
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

  function showSources(ids: string[]) {
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: ids.map((id) => row(id, KnowledgeProcessingState.READY)),
      spaces: [],
    });
    renderList();
  }

  it('deselects the source when its details close', () => {
    showSources(['a']);
    fireEvent.click(screen.getByText('Source a'));
    expect(screen.getByTestId('detail')).toHaveTextContent('Source a');

    act(() => {
      mocks.detailClose?.();
    });

    expect(screen.queryByTestId('detail')).toBeNull();
  });

  it('reopens collapsed details when the selected source is clicked again', () => {
    showSources(['a', 'b']);

    fireEvent.click(screen.getByText('Source a'));
    expect(mocks.reveal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Source a'));
    expect(mocks.reveal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('detail')).toHaveTextContent('Source a');

    fireEvent.click(screen.getByText('Source b'));
    expect(mocks.reveal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('detail')).toHaveTextContent('Source b');
  });

  it('keeps a newer selection when an earlier archive completes', async () => {
    let finishArchive: () => void = () => undefined;
    mocks.archive.mockReturnValue(
      new Promise<void>((resolve) => {
        finishArchive = resolve;
      }),
    );
    showSources(['a', 'b']);
    fireEvent.click(screen.getByText('Source a'));

    let pendingArchive: Promise<void> | undefined;
    act(() => {
      pendingArchive = mocks.detailArchive?.();
    });
    await waitFor(() =>
      expect(mocks.archive).toHaveBeenCalledWith('a', 'brand-1'),
    );
    fireEvent.click(screen.getByText('Source b'));
    await act(async () => {
      finishArchive();
      await pendingArchive;
    });

    expect(mocks.archive).toHaveBeenCalledWith('a', 'brand-1');
    expect(screen.getByTestId('detail')).toHaveTextContent('Source b');
  });

  it('deselects the archived source when it is still selected', async () => {
    mocks.archive.mockResolvedValue(undefined);
    showSources(['a']);
    fireEvent.click(screen.getByText('Source a'));

    await act(async () => {
      await mocks.detailArchive?.();
    });

    expect(screen.queryByTestId('detail')).toBeNull();
  });
  it('mounts an offpage sourceId without changing the page and preserves unrelated parameters on close', () => {
    mocks.search = 'page=3&view=all&sourceId=offpage';
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      selectionError: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: [row('a', KnowledgeProcessingState.READY)],
      spaces: [],
      selectedRow: row('offpage', KnowledgeProcessingState.FAILED),
    });
    const view = renderList();
    expect(mocks.useKnowledgeLibrary).toHaveBeenCalledWith({
      brandId: 'brand-1',
      page: 3,
      selectedSourceId: 'offpage',
    });
    expect(screen.getByTestId('detail')).toHaveTextContent('Source offpage');
    act(() => mocks.detailClose?.());
    expect(mocks.replace).toHaveBeenCalledWith(
      '/org/brand/settings/knowledge?page=3&view=all',
      { scroll: false },
    );
    view.rerender(
      <KnowledgeSourcesList
        brandId="brand-1"
        isAddOpen={false}
        onAddClose={vi.fn()}
        seedRequestId={0}
        onSeedHandled={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('detail')).toBeNull();
  });

  it.each([
    'sourceId=',
    'sourceId=bad%2Fid',
    'sourceId=a&sourceId=b',
    `sourceId=${'a'.repeat(129)}`,
  ])(
    'renders generic invalid selection without requesting detail for %s',
    (search) => {
      mocks.search = search;
      renderList();
      expect(mocks.useKnowledgeLibrary).toHaveBeenLastCalledWith(
        expect.objectContaining({ selectedSourceId: undefined }),
      );
      expect(
        screen.getByText('Knowledge could not be loaded.'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('detail')).toBeNull();
    },
  );

  it('keeps an offpage selected source inspectable outside the local space filter', () => {
    mocks.search = 'page=3&sourceId=offpage';
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      selectionError: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: [row('a', KnowledgeProcessingState.READY)],
      spaces: [{ id: 'inbox', isInbox: true, title: 'Inbox' }],
      selectedRow: row('offpage', KnowledgeProcessingState.READY),
    });
    renderList();
    expect(screen.getByText('Source a')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inbox' }));
    expect(screen.queryByText('Source a')).toBeNull();
    expect(screen.getByTestId('detail')).toHaveTextContent('Source offpage');
    expect(mocks.useKnowledgeLibrary).toHaveBeenLastCalledWith({
      brandId: 'brand-1',
      page: 3,
      selectedSourceId: 'offpage',
    });
  });

  it('archives only the matching URL selection while preserving page and unrelated query parameters', async () => {
    mocks.search = 'page=3&view=all&sourceId=offpage';
    mocks.archive.mockResolvedValue(undefined);
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      selectionError: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: [],
      spaces: [],
      selectedRow: row('offpage', KnowledgeProcessingState.READY),
    });
    renderList();
    await act(async () => {
      await mocks.detailArchive?.();
    });
    expect(mocks.archive).toHaveBeenCalledWith('offpage', 'brand-1');
    expect(mocks.replace).toHaveBeenCalledWith(
      '/org/brand/settings/knowledge?page=3&view=all',
      { scroll: false },
    );
    expect(screen.queryByTestId('detail')).toBeNull();
  });

  it('renders denied selection separately from the page with a generic retry', () => {
    mocks.search = 'sourceId=offpage';
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      selectionError: 'PRIVATE_DENIAL',
      isLoading: false,
      refresh: mocks.refresh,
      rows: [row('a', KnowledgeProcessingState.READY)],
      spaces: [],
      selectedRow: null,
    });
    renderList();
    expect(screen.getByText('Source a')).toBeInTheDocument();
    expect(screen.queryByText('PRIVATE_DENIAL')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('follows changed URL selection and never displays old details while loading', () => {
    mocks.search = 'sourceId=a';
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: [],
      spaces: [],
      selectedRow: row('a', KnowledgeProcessingState.READY),
    });
    const view = renderList();
    expect(screen.getByTestId('detail')).toHaveTextContent('Source a');
    mocks.search = 'sourceId=b';
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      isLoading: true,
      refresh: mocks.refresh,
      rows: [],
      spaces: [],
      selectedRow: row('a', KnowledgeProcessingState.READY),
    });
    view.rerender(
      <KnowledgeSourcesList
        brandId="brand-1"
        isAddOpen={false}
        onAddClose={vi.fn()}
        seedRequestId={0}
        onSeedHandled={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('detail')).toBeNull();
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: [],
      spaces: [],
      selectedRow: row('b', KnowledgeProcessingState.READY),
    });
    view.rerender(
      <KnowledgeSourcesList
        brandId="brand-1"
        isAddOpen={false}
        onAddClose={vi.fn()}
        seedRequestId={0}
        onSeedHandled={vi.fn()}
      />,
    );
    expect(screen.getByTestId('detail')).toHaveTextContent('Source b');
    mocks.search = 'sourceId=a';
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: [],
      spaces: [],
      selectedRow: row('a', KnowledgeProcessingState.READY),
    });
    view.rerender(
      <KnowledgeSourcesList
        brandId="brand-1"
        isAddOpen={false}
        onAddClose={vi.fn()}
        seedRequestId={0}
        onSeedHandled={vi.fn()}
      />,
    );
    expect(screen.getByTestId('detail')).toHaveTextContent('Source a');
  });

  it.each(['brand', 'identity', 'selection', 'unmount'])(
    'does not dispatch a selected refresh after a delayed token and %s change',
    async (change) => {
      mocks.useKnowledgeLibrary.mockReturnValue({
        error: null,
        isLoading: false,
        refresh: mocks.refresh,
        rows: [
          row('a', KnowledgeProcessingState.READY),
          row('b', KnowledgeProcessingState.READY),
        ],
        spaces: [],
      });
      const view = renderList();
      fireEvent.click(screen.getByText('Source a'));
      let complete!: () => void;
      mocks.tokenWait = new Promise<void>((resolve) => {
        complete = resolve;
      });
      let pending: Promise<void> | undefined;
      act(() => {
        pending = mocks.detailRefresh?.();
      });
      if (change === 'selection') fireEvent.click(screen.getByText('Source b'));
      else if (change === 'unmount') view.unmount();
      else {
        if (change === 'identity') mocks.authEpoch++;
        view.rerender(
          <KnowledgeSourcesList
            brandId={change === 'brand' ? 'brand-2' : 'brand-1'}
            isAddOpen={false}
            onAddClose={vi.fn()}
            seedRequestId={0}
            onSeedHandled={vi.fn()}
          />,
        );
      }
      await act(async () => {
        complete();
        await pending;
      });
      expect(mocks.refreshSource).not.toHaveBeenCalled();
    },
  );

  it.each(['brand', 'actor', 'session', 'organization'])(
    'ignores old selected-refresh completion after %s scope changes',
    async (change) => {
      mocks.useKnowledgeLibrary.mockReturnValue({
        error: null,
        isLoading: false,
        refresh: mocks.refresh,
        rows: [row('a', KnowledgeProcessingState.READY)],
        spaces: [],
      });
      const view = renderList();
      fireEvent.click(screen.getByText('Source a'));
      let complete!: () => void;
      mocks.refreshSource.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            complete = resolve;
          }),
      );
      let pending: Promise<void> | undefined;
      act(() => {
        pending = mocks.detailRefresh?.();
      });
      await waitFor(() => expect(mocks.refreshSource).toHaveBeenCalledOnce());
      if (change !== 'brand') mocks.authEpoch++;
      mocks.useKnowledgeLibrary.mockReturnValue({
        error: null,
        isLoading: false,
        refresh: mocks.refresh,
        rows: [],
        spaces: [],
        selectedRow: null,
      });
      view.rerender(
        <KnowledgeSourcesList
          brandId={change === 'brand' ? 'brand-2' : 'brand-1'}
          isAddOpen={false}
          onAddClose={vi.fn()}
          seedRequestId={0}
          onSeedHandled={vi.fn()}
        />,
      );
      await act(async () => {
        complete();
        await pending;
      });
      expect(mocks.notificationSuccess).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(screen.queryByTestId('detail')).toBeNull();
    },
  );

  it('does not dispatch a retained selected action after selected-read denial', async () => {
    mocks.search = 'sourceId=offpage';
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: [],
      spaces: [],
      selectedRow: row('offpage', KnowledgeProcessingState.READY),
    });
    const view = renderList();
    let complete!: () => void;
    mocks.tokenWait = new Promise<void>((resolve) => {
      complete = resolve;
    });
    let pending: Promise<void> | undefined;
    act(() => {
      pending = mocks.detailRefresh?.();
    });
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: [],
      spaces: [],
      selectedRow: null,
      selectionError: 'Knowledge could not be loaded.',
    });
    view.rerender(
      <KnowledgeSourcesList
        brandId="brand-1"
        isAddOpen={false}
        onAddClose={vi.fn()}
        seedRequestId={0}
        onSeedHandled={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('detail')).toBeNull();
    await act(async () => {
      complete();
      await pending;
    });
    expect(mocks.refreshSource).not.toHaveBeenCalled();
  });

  it('uses the actual detail panel and provider for deep-linked Refresh and Retry', async () => {
    mocks.useRealPanel = true;
    mocks.search = 'sourceId=offpage';
    const selected = {
      ...row('offpage', KnowledgeProcessingState.FAILED),
      version: {
        ...row('offpage', KnowledgeProcessingState.FAILED).version,
        payload: { text: 'Authorized offpage evidence' },
        provenance: null,
      },
    };
    mocks.useKnowledgeLibrary.mockReturnValue({
      error: null,
      isLoading: false,
      refresh: mocks.refresh,
      rows: [],
      spaces: [],
      selectedRow: selected,
    });
    render(
      <ContextSidebarProvider>
        <ContextSidebarOutlet testId="real-outlet" />
        <KnowledgeSourcesList
          brandId="brand-1"
          isAddOpen={false}
          onAddClose={vi.fn()}
          seedRequestId={0}
          onSeedHandled={vi.fn()}
        />
      </ContextSidebarProvider>,
    );
    expect(screen.getByTestId('real-outlet')).toHaveTextContent(
      'Authorized offpage evidence',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    await waitFor(() =>
      expect(mocks.refreshSource).toHaveBeenCalledWith(
        'offpage',
        'brand-1',
        expect.stringMatching(/^refresh-offpage-/),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry ingestion' }));
    await waitFor(() =>
      expect(mocks.retry).toHaveBeenCalledWith('offpage', 'brand-1'),
    );
  });
});
