import BrandDetail from '@pages/brands/brand-detail';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({
    id: 'brand-123',
  })),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: vi.fn(() => ({
    data: null,
    isLoading: false,
    refresh: vi.fn(),
  })),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('BrandDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<BrandDetail />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
