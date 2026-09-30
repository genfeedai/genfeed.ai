import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingDetail from './training-detail';

const mocks = vi.hoisted(() => {
  const findOne = vi.fn();

  return {
    findOne,
    getService: vi.fn(async () => ({ findOne })),
    notificationsService: {
      error: vi.fn(),
      success: vi.fn(),
    },
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brands: [],
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => mocks.getService),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => mocks.notificationsService),
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
    mocks.findOne.mockReturnValueOnce(new Promise(() => undefined));
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

  it('keeps the tab chrome mounted (module chrome, not classic) when the training fails to load', async () => {
    // Regression coverage: this route has no page-help entry, so nothing
    // masked the bug the way it did for Clips. The error branch used to
    // render a single, bare `Container` with none of the `headerTabs` the
    // loading/loaded branches always have — the whole Images/Sources tab
    // section disappeared the moment a training failed to load. `moduleChrome`
    // plus sharing the same `headerTabs` config across both branches (see
    // training-detail.tsx) keeps it present and in module-chrome mode.
    mocks.findOne.mockResolvedValueOnce(null);

    render(
      <TrainingDetail trainingId="training-123">
        <div>Tab content</div>
      </TrainingDetail>,
    );

    expect(
      await screen.findByText('Failed to load training details'),
    ).toBeVisible();

    const containers = screen.getAllByTestId('container');
    expect(containers).toHaveLength(2);
    expect(screen.getByText('Images')).toBeVisible();
    expect(screen.getByText('Sources')).toBeVisible();
    expect(containers[1]).toHaveAttribute(
      'data-module-chrome',
      'section-topbar',
    );
  });
});
