import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AutomationAnalyticsPage from './AutomationAnalyticsPage';
import '@testing-library/jest-dom';

vi.mock('@clerk/nextjs', () => ({
  useAuth: vi.fn(() => ({
    isSignedIn: true,
  })),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-123',
    organizationId: 'org-123',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: vi.fn(() => ({
    data: null,
    isLoading: false,
    refresh: vi.fn(),
  })),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useExportModal: vi.fn(() => ({
    openExport: vi.fn(),
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

describe('AutomationAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<AutomationAnalyticsPage />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
