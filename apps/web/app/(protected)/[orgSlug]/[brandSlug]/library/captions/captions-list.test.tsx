import { paginatedResponse } from '@app-tests/paginated-response';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { Caption } from '@models/content/caption.model';
import { PagesService } from '@services/content/pages.service';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CaptionsList from './captions-list';
import '@testing-library/jest-dom/vitest';

const findAllPageMock = vi.fn<() => Promise<IPaginatedResponse<Caption>>>();
const getServiceMock = vi.fn(async () => ({ findAllPage: findAllPageMock }));
const { loggerErrorMock, searchParamValues } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  searchParamValues: { page: '1' } as Record<string, string>,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => getServiceMock),
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
    getInstance: vi.fn(),
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

describe('CaptionsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete searchParamValues.q;
    findAllPageMock.mockResolvedValue(paginatedResponse([]));
  });

  it('searches captions on the server with the term in the URL', async () => {
    searchParamValues.q = 'welcome';
    render(<CaptionsList />);

    await screen.findByText('No captions found');
    expect(findAllPageMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, search: 'welcome' }),
      expect.any(AbortSignal),
    );
  });

  it('renders the empty list', async () => {
    const { container } = render(<CaptionsList />);
    expect(container.firstChild).toBeInTheDocument();
    expect(await screen.findByText('No captions found')).toBeInTheDocument();
  });

  it('should display empty state when no captions', async () => {
    render(<CaptionsList />);
    expect(await screen.findByText('No captions found')).toBeInTheDocument();
  });

  it('should render table with correct columns', async () => {
    findAllPageMock.mockResolvedValue(
      paginatedResponse([
        {
          createdAt: '2026-03-10T00:00:00.000Z',
          format: 'srt',
          id: 'caption-1',
          label: 'Caption 1',
        } as Caption,
      ]),
    );

    render(<CaptionsList />);
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
      render(<CaptionsList />);

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
  it('renders its server totals even when another list overwrites the legacy totals', async () => {
    findAllPageMock.mockResolvedValue(
      paginatedResponse([], { totalDocs: 61, totalPages: 5 }),
    );
    const { rerender } = render(<CaptionsList />);
    expect(await screen.findByText('61 captions')).toBeVisible();
    PagesService.setTotalDocs(200);
    PagesService.setTotalPages(20);
    rerender(<CaptionsList />);
    expect(screen.getByText('61 captions')).toBeVisible();
    expect(screen.queryByText('200 captions')).not.toBeInTheDocument();
  });

  it('starts empty while its response is pending', async () => {
    let resolvePage: ((page: IPaginatedResponse<Caption>) => void) | undefined;
    findAllPageMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    PagesService.setTotalDocs(200);
    PagesService.setTotalPages(20);
    render(<CaptionsList />);
    expect(screen.getByText('0 captions')).toBeVisible();
    await act(async () => {
      resolvePage?.(paginatedResponse([]));
    });
    expect(screen.getByText('0 captions')).toBeVisible();
  });
});
