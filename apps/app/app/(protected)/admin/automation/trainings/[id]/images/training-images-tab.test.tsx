import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingImagesTab from './training-images-tab';

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@contexts/content/training-context/training-context', () => ({
  useTraining: vi.fn(() => ({
    training: {
      brand: 'brand-123',
      id: 'training-123',
      model: 'model-123',
      status: 'completed',
      trigger: 'trigger',
    },
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}));

vi.mock('@ui/masonry/grid/MasonryGrid', () => ({
  default: vi.fn(() => <div data-testid="masonry-grid" />),
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

  it('should surface a toast when the query errors', () => {
    mocks.useQuery.mockReturnValue({
      data: [],
      error: new Error('boom'),
      isLoading: false,
    });
    render(<TrainingImagesTab />);
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to fetch generated assets',
    );
  });
});
