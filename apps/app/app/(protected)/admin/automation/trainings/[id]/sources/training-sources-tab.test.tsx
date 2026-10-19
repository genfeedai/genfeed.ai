import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingSourcesTab from './training-sources-tab';

const mocks = vi.hoisted(() => ({
  getTrainingSources: vi.fn().mockResolvedValue([]),
  searchParams: new URLSearchParams(),
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@contexts/content/training-context/training-context', () => ({
  useTraining: vi.fn(() => ({
    training: {
      id: 'training-123',
    },
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn(async () => ({ getTrainingSources: mocks.getTrainingSources })),
  ),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}));

vi.mock('@ui/ingredients/list/media-grid/IngredientsMediaGrid', () => ({
  default: vi.fn(() => <div data-testid="masonry-grid" />),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/automation/trainings/training-123/sources',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError, info: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: mocks.notificationsError,
      success: vi.fn(),
    })),
  },
}));

describe('TrainingSourcesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.useQuery.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: true,
    });
  });

  it('should render the loading grid while fetching', () => {
    const { container } = render(<TrainingSourcesTab />);
    expect(container.firstChild).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="masonry-grid"]'),
    ).toBeInTheDocument();
  });

  it('pages the query by the URL page and renders pagination', async () => {
    mocks.searchParams = new URLSearchParams('page=2');
    mocks.useQuery.mockReturnValue({
      data: [{ id: 'image-1' }],
      error: undefined,
      isLoading: false,
    });
    render(<TrainingSourcesTab />);

    const options = mocks.useQuery.mock.calls.at(-1)?.[0];
    expect(options.queryKey).toContain(2);
    const signal = new AbortController().signal;
    await options.queryFn({ signal });
    expect(mocks.getTrainingSources).toHaveBeenCalledWith(
      'training-123',
      { limit: ITEMS_PER_PAGE, page: 2 },
      signal,
    );
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
  });

  it('should render the grid once sources are loaded', () => {
    mocks.useQuery.mockReturnValue({
      data: [{ id: 'image-1' }],
      error: undefined,
      isLoading: false,
    });
    const { container } = render(<TrainingSourcesTab />);
    expect(
      container.querySelector('[data-testid="masonry-grid"]'),
    ).toBeInTheDocument();
  });

  it('should surface a toast when the query errors', () => {
    mocks.useQuery.mockReturnValue({
      data: [],
      error: new Error('boom'),
      isLoading: false,
    });
    render(<TrainingSourcesTab />);
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to fetch training sources',
    );
  });
});
