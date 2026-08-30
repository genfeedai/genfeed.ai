import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingDetail from './training-detail';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brands: [],
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => async () => ({ findOne: mocks.findOne })),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/admin/automation/trainings/training-123'),
  useRouter: vi.fn(() => ({ prefetch: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@ui/display/skeleton/skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton" />,
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div data-testid="loading" />,
}));

describe('TrainingDetail shell-first loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    mocks.findOne.mockResolvedValueOnce(null);
    const { container } = render(
      <TrainingDetail trainingId="training-123">
        <div>Tab content</div>
      </TrainingDetail>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders the header and tab chrome immediately while the training is loading', () => {
    mocks.findOne.mockReturnValueOnce(new Promise(() => undefined));

    render(
      <TrainingDetail trainingId="training-123">
        <div>Tab content</div>
      </TrainingDetail>,
    );

    expect(screen.getAllByTestId('container')).toHaveLength(2);
    expect(screen.getByText('Images')).toBeVisible();
    expect(screen.getByText('Sources')).toBeVisible();
    expect(screen.getByTestId('skeleton')).toBeVisible();
    expect(screen.getByTestId('loading')).toBeVisible();
    expect(
      screen.queryByText('Failed to load training details'),
    ).not.toBeInTheDocument();
  });

  it('renders training details in place of the loaders once loading resolves', async () => {
    mocks.findOne.mockResolvedValueOnce({
      description: '',
      id: 'training-123',
      label: 'Sample Training',
      status: 'completed',
      totalGeneratedImages: 3,
      totalSources: 2,
    });

    render(
      <TrainingDetail trainingId="training-123">
        <div>Tab content</div>
      </TrainingDetail>,
    );

    expect(await screen.findByText('Sample Training')).toBeVisible();
    expect(screen.getByText('Tab content')).toBeVisible();
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
  });

  it('shows the error card when the training fails to load', async () => {
    mocks.findOne.mockResolvedValueOnce(null);

    render(
      <TrainingDetail trainingId="training-123">
        <div>Tab content</div>
      </TrainingDetail>,
    );

    expect(
      await screen.findByText('Failed to load training details'),
    ).toBeVisible();
    expect(screen.getByText('Training not found')).toBeVisible();
  });
});
