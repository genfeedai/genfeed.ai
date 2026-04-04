import ActivitiesList from '@pages/activities/list/activities-list';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock dependencies
vi.mock('@hooks/data/activities/use-activities/use-activities', () => ({
  useActivities: vi.fn(() => ({
    filteredActivities: [],
    isLoading: false,
    isRefreshing: false,
    markActivitiesAsRead: vi.fn(),
    refresh: vi.fn(),
    toggleActivityRead: vi.fn(),
  })),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => '1'),
  })),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useIngredientOverlay: vi.fn(() => ({
    openIngredientOverlay: vi.fn(),
  })),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: Record<string, unknown>) => (
    <img src={src as string} alt={alt as string} {...props} />
  ),
}));

describe('ActivitiesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<ActivitiesList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display the container label and description', () => {
    render(<ActivitiesList />);
    expect(screen.getByText('Activities')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Track your recent actions, content updates, and system events',
      ),
    ).toBeInTheDocument();
  });

  it('should render mark all read button', () => {
    render(<ActivitiesList />);
    expect(screen.getByText('Mark All Read')).toBeInTheDocument();
  });

  it('should display empty state when no activities', () => {
    render(<ActivitiesList />);
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });
});
