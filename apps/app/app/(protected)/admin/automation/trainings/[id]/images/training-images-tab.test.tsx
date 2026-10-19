import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingImagesTab from './training-images-tab';

const mocks = vi.hoisted(() => ({
  getTrainingImages: vi.fn().mockResolvedValue([]),
  searchParams: new URLSearchParams(),
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  useTraining: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@contexts/content/training-context/training-context', () => ({
  useTraining: mocks.useTraining,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn(async () => ({ getTrainingImages: mocks.getTrainingImages })),
  ),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}));

vi.mock('@ui/ingredients/list/media-grid/IngredientsMediaGrid', () => ({
  default: vi.fn(() => <div data-testid="masonry-grid" />),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/automation/trainings/training-123/images',
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

describe('TrainingImagesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.useTraining.mockReturnValue({
      training: {
        brand: 'brand-123',
        id: 'training-123',
        model: 'model-123',
        status: 'completed',
        trigger: 'trigger',
      },
    });
    mocks.useQuery.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: true,
    });
  });

  it('should render the loading grid while fetching', () => {
    const { container } = render(<TrainingImagesTab />);
    expect(container.firstChild).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="masonry-grid"]'),
    ).toBeInTheDocument();
  });

  it('pages the query by the URL page and renders pagination', async () => {
    mocks.searchParams = new URLSearchParams('page=3');
    mocks.useQuery.mockReturnValue({
      data: [{ id: 'image-1' }],
      error: undefined,
      isLoading: false,
    });
    render(<TrainingImagesTab />);

    const options = mocks.useQuery.mock.calls.at(-1)?.[0];
    expect(options.queryKey).toContain(3);
    const signal = new AbortController().signal;
    await options.queryFn({ signal });
    expect(mocks.getTrainingImages).toHaveBeenCalledWith(
      'training-123',
      { brand: undefined, limit: ITEMS_PER_PAGE, page: 3 },
      signal,
    );
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
  });

  it('should render the grid once assets are loaded', () => {
    mocks.useQuery.mockReturnValue({
      data: [{ id: 'image-1' }],
      error: undefined,
      isLoading: false,
    });
    const { container } = render(<TrainingImagesTab />);
    expect(
      container.querySelector('[data-testid="masonry-grid"]'),
    ).toBeInTheDocument();
  });

  it('should surface a toast and error state when the query errors', async () => {
    mocks.useQuery.mockReturnValue({
      data: [],
      error: new Error('boom'),
      isLoading: false,
    });
    render(<TrainingImagesTab />);
    expect(
      screen.getByText('Generated assets failed to load'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to fetch generated assets',
      );
    });
  });

  it('should render a model unavailable state while the query is disabled', () => {
    mocks.useTraining.mockReturnValue({
      training: {
        brand: 'brand-123',
        id: 'training-123',
        model: undefined,
        status: 'completed',
        trigger: 'trigger',
      },
    });
    mocks.useQuery.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
    });

    render(<TrainingImagesTab />);

    expect(screen.getByText('Training model unavailable')).toBeInTheDocument();
  });
});
