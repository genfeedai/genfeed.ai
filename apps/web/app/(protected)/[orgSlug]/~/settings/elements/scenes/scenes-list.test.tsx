import { paginatedResponse } from '@app-tests/paginated-response';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { ElementScene } from '@models/elements/scene.model';
import { PagesService } from '@services/content/pages.service';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScenesList from './scenes-list';
import '@testing-library/jest-dom/vitest';

const findAllPageMock =
  vi.fn<() => Promise<IPaginatedResponse<ElementScene>>>();
const getServiceMock = vi.fn(async () => ({ findAllPage: findAllPageMock }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => getServiceMock),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/org-123/~/settings/elements/scenes'),
  useRouter: vi.fn(() => ({
    replace: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn((key: string) => (key === 'page' ? '1' : null)),
    toString: vi.fn(() => 'page=1'),
  })),
}));

const notifications = { error: vi.fn(), success: vi.fn() };
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => notifications),
  },
}));

describe('ScenesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllPageMock.mockResolvedValue(paginatedResponse([]));
  });

  it('renders the empty list', async () => {
    const { container } = render(<ScenesList />);
    expect(container.firstChild).toBeInTheDocument();
    expect(await screen.findByText('No scenes found')).toBeInTheDocument();
  });

  it('offers the shared search field', async () => {
    render(<ScenesList />);
    expect(
      screen.getByRole('textbox', { name: 'Search scenes' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('No scenes found')).toBeInTheDocument();
  });
  it('renders its server totals even when another list overwrites the legacy totals', async () => {
    findAllPageMock.mockResolvedValue(
      paginatedResponse([], { totalDocs: 61, totalPages: 5 }),
    );
    const { rerender } = render(<ScenesList />);
    expect(await screen.findByText('61 scenes')).toBeVisible();
    PagesService.setTotalDocs(200);
    PagesService.setTotalPages(20);
    rerender(<ScenesList />);
    expect(screen.getByText('61 scenes')).toBeVisible();
    expect(screen.queryByText('200 scenes')).not.toBeInTheDocument();
  });

  it('starts empty while its response is pending', async () => {
    let resolvePage:
      | ((page: IPaginatedResponse<ElementScene>) => void)
      | undefined;
    findAllPageMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    PagesService.setTotalDocs(200);
    PagesService.setTotalPages(20);
    render(<ScenesList />);
    expect(screen.getByText('0 scenes')).toBeVisible();
    await act(async () => {
      resolvePage?.(paginatedResponse([]));
    });
    expect(screen.getByText('0 scenes')).toBeVisible();
  });
});
