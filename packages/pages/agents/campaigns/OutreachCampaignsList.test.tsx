import OutreachCampaignsList from '@pages/agents/campaigns/OutreachCampaignsList';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    organizationId: 'org-123',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: vi.fn(() => ({
    data: [],
    isLoading: false,
    refresh: vi.fn(),
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
  })),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: vi.fn(() => ({
    openConfirm: vi.fn(),
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

describe('OutreachCampaignsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<OutreachCampaignsList />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
