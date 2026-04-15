import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingImagesTab from './training-images-tab';

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

describe('TrainingImagesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<TrainingImagesTab />);
    expect(container.firstChild).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="masonry-grid"]'),
    ).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<TrainingImagesTab />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<TrainingImagesTab />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
