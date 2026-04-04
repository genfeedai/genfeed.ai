import TwitchChatBot from '@pages/agents/library/TwitchChatBot';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const findAllByOrganizationMock = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-123',
    organizationId: 'org-123',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => async () => ({
    findAllByOrganization: findAllByOrganizationMock,
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

describe('TwitchChatBot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllByOrganizationMock.mockReturnValue(new Promise(() => {}));
  });

  it('should render without crashing', () => {
    render(<TwitchChatBot />);
    expect(screen.getByText('Loading livestream bot...')).toBeInTheDocument();
  });
});
