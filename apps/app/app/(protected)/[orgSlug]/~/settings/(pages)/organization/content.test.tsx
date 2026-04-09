import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsOrganizationPage from './content';
import '@testing-library/jest-dom';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    isReady: true,
    organizationId: 'org-123',
    selectedBrand: null,
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: vi.fn(() => ({
    settings: {
      isAdvancedMode: false,
      isDarkroomNsfwVisible: false,
    },
    updateSettings: vi.fn(),
  })),
}));

vi.mock('./organization-identity-defaults-card', () => ({
  default: () => <div>Organization Identity Defaults</div>,
}));

vi.mock('./organization-generation-defaults-card', () => ({
  default: () => <div>Organization Generation Defaults</div>,
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

describe('SettingsOrganizationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<SettingsOrganizationPage />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
