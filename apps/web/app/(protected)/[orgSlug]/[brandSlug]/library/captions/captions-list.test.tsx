import { paginatedResponse } from '@app-tests/paginated-response';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { CaptionFormat } from '@genfeedai/contracts';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import { Caption } from '@models/content/caption.model';

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CaptionsList from './captions-list';
import '@testing-library/jest-dom/vitest';

const { findAllPageMock, loggerErrorMock, searchParamValues } = vi.hoisted(
  () => ({
    findAllPageMock: vi.fn<() => Promise<IPaginatedResponse<Caption>>>(),
    loggerErrorMock: vi.fn(),
    searchParamValues: { page: '1' } as Record<string, string>,
  }),
);
const viewer = vi.hoisted(() => ({
  current: {
    getToken: async () => 'test-token',
    orgId: 'org-1',
    sessionId: 'session-1',
    userId: 'user-1',
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => viewer.current,
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/library/captions'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn((key: string) => searchParamValues[key] ?? null),
    getAll: vi.fn(() => []),
    toString: vi.fn(() => ''),
  })),
}));

vi.mock('@services/content/captions.service', () => ({
  CaptionsService: {
    getInstance: () => ({ findAllPage: findAllPageMock }),
  },
}));

vi.mock('@services/core/notifications.service', () => {
  const service = {
    error: vi.fn(),
    success: vi.fn(),
  };

  return {
    NotificationsService: {
      getInstance: vi.fn(() => service),
    },
  };
});

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: loggerErrorMock,
    info: vi.fn(),
  },
}));

function renderList(client = createTestQueryClient()) {
  return render(<CaptionsList />, { wrapper: queryClientWrapper(client) });
}

const CAPTION = new Caption({
  createdAt: '2026-03-10T00:00:00.000Z',
  format: CaptionFormat.SRT,
  id: 'caption-1',
  language: 'en',
});

describe('CaptionsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete searchParamValues.q;
    viewer.current = { ...viewer.current, orgId: 'org-1' };
    findAllPageMock.mockResolvedValue(paginatedResponse([]));
  });

  it('searches captions on the server with the term in the URL', async () => {
    searchParamValues.q = 'welcome';
    renderList();

    await screen.findByText('No captions found');
    expect(findAllPageMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, search: 'welcome' }),
      expect.any(AbortSignal),
    );
  });

  it('renders the empty list', async () => {
    const { container } = renderList();
    expect(container.firstChild).toBeInTheDocument();
    expect(await screen.findByText('No captions found')).toBeInTheDocument();
  });

  it('should display empty state when no captions', async () => {
    renderList();
    expect(await screen.findByText('No captions found')).toBeInTheDocument();
  });

  it('should render table with correct columns', async () => {
    findAllPageMock.mockResolvedValue(paginatedResponse([CAPTION]));

    renderList();
    expect(await screen.findByText('Label')).toBeInTheDocument();
    expect(screen.getByText('Format')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('should render a recoverable error state and retry without console errors', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    findAllPageMock.mockRejectedValue(new Error('network unavailable'));

    try {
      renderList();

      expect(
        await screen.findByText('Captions could not be loaded.'),
      ).toBeInTheDocument();
      expect(loggerErrorMock).toHaveBeenCalled();

      const callsBeforeRetry = findAllPageMock.mock.calls.length;
      findAllPageMock.mockResolvedValue(paginatedResponse([]));
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      expect(await screen.findByText('No captions found')).toBeInTheDocument();
      expect(findAllPageMock.mock.calls.length).toBeGreaterThan(
        callsBeforeRetry,
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
  it('renders the totals from the same response as its captions', async () => {
    findAllPageMock.mockResolvedValue(
      paginatedResponse([], { totalDocs: 61, totalPages: 5 }),
    );
    const { rerender } = renderList();
    expect(await screen.findByText('61 captions')).toBeVisible();

    rerender(<CaptionsList />);
    expect(screen.getByText('61 captions')).toBeVisible();
    expect(screen.queryByText('200 captions')).not.toBeInTheDocument();
  });

  it('paints the cached captions at once when the page is opened again', async () => {
    findAllPageMock.mockResolvedValue(
      paginatedResponse([CAPTION], { totalDocs: 1, totalPages: 1 }),
    );
    const client = createTestQueryClient();
    const first = renderList(client);
    expect(await screen.findByText('srt')).toBeInTheDocument();
    first.unmount();

    findAllPageMock.mockReturnValue(new Promise(() => undefined));
    renderList(client);

    expect(screen.getByText('srt')).toBeInTheDocument();
    expect(screen.getByText('1 captions')).toBeVisible();
  });

  it('never shows another organization the captions cached for this one', async () => {
    findAllPageMock.mockResolvedValue(paginatedResponse([CAPTION]));
    const client = createTestQueryClient();
    const first = renderList(client);
    expect(await screen.findByText('srt')).toBeInTheDocument();
    first.unmount();

    viewer.current = { ...viewer.current, orgId: 'org-2' };
    findAllPageMock.mockReturnValue(new Promise(() => undefined));
    renderList(client);

    expect(screen.queryByText('srt')).not.toBeInTheDocument();
    expect(screen.getByText('0 captions')).toBeVisible();
  });

  it('keeps the current rows on screen while another search loads', async () => {
    findAllPageMock.mockResolvedValue(paginatedResponse([CAPTION]));
    const { rerender } = renderList();
    expect(await screen.findByText('srt')).toBeInTheDocument();

    findAllPageMock.mockReturnValue(new Promise(() => undefined));
    searchParamValues.q = 'welcome';
    rerender(<CaptionsList />);

    await waitFor(() =>
      expect(findAllPageMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'welcome' }),
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByText('srt')).toBeInTheDocument();
  });

  it('keeps the list on screen when a background refresh fails', async () => {
    findAllPageMock.mockResolvedValue(paginatedResponse([CAPTION]));
    const client = createTestQueryClient();
    renderList(client);
    expect(await screen.findByText('srt')).toBeInTheDocument();

    findAllPageMock.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await client.refetchQueries({ queryKey: ['library-captions'] });
    });

    await waitFor(() => expect(screen.getByText('srt')).toBeInTheDocument());
    expect(
      screen.queryByText('Captions could not be loaded.'),
    ).not.toBeInTheDocument();
  });

  it('starts empty while its response is pending', async () => {
    let resolvePage: ((page: IPaginatedResponse<Caption>) => void) | undefined;
    findAllPageMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );

    renderList();
    expect(screen.getByText('0 captions')).toBeVisible();
    await act(async () => {
      resolvePage?.(paginatedResponse([]));
    });
    expect(screen.getByText('0 captions')).toBeVisible();
  });
});
