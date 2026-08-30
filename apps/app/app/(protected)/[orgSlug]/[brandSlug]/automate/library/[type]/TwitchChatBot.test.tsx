import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TwitchChatBot from './TwitchChatBot';
import '@testing-library/jest-dom/vitest';

const findAllByOrganizationMock = vi.fn();

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

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

vi.mock('next/navigation', () => ({
  usePathname: () => '/org-1/brand-1/automate/library/twitch-chat-bot',
  useSearchParams: () => new URLSearchParams(),
}));

describe('TwitchChatBot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllByOrganizationMock.mockReturnValue(new Promise(() => {}));
  });

  it('renders the page chrome while the bot is still loading', () => {
    render(<TwitchChatBot />);

    expect(
      screen.getByRole('heading', { name: 'Livestream Chat Bot' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Runtime Controls')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });
});
