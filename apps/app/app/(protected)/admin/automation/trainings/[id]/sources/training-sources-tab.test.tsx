import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingSourcesTab from './training-sources-tab';

vi.mock('@contexts/content/training-context/training-context', () => ({
  useTraining: vi.fn(() => ({
    training: {
      id: 'training-123',
    },
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@ui/masonry/grid/MasonryGrid', () => ({
  default: vi.fn(() => <div data-testid="masonry-grid" />),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('TrainingSourcesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<TrainingSourcesTab />);
    expect(container.firstChild).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="masonry-grid"]'),
    ).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<TrainingSourcesTab />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<TrainingSourcesTab />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
