import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnnouncementsPage from './announcements-page';

const mocks = vi.hoisted(() => ({
  getAnnouncements: vi.fn(),
  notifications: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('page=2'),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getAnnouncements: mocks.getAnnouncements,
  }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => mocks.notifications },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('@ui/layout/admin-page-shell/AdminPageShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));

describe('AnnouncementsPage history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAnnouncements.mockResolvedValue([]);
  });

  it('requests the page in the URL and shows the pager', async () => {
    render(<AnnouncementsPage defaultTab="history" />);

    await waitFor(() =>
      expect(mocks.getAnnouncements).toHaveBeenCalledWith(
        { limit: 15, page: 2 },
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
  });
});
