import { PageScope } from '@genfeedai/enums';
import PostsCalendarPage from '@pages/calendar/posts/posts-calendar-page';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const findAllMock = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-123',
    organizationId: 'org-123',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn(async () => ({
      findAll: findAllMock,
    })),
  ),
}));

vi.mock('@hooks/utils/use-calendar-week-range/use-calendar-week-range', () => ({
  useCalendarWeekRange: vi.fn(() => [
    {
      end: new Date('2026-03-16T00:00:00.000Z'),
      start: new Date('2026-03-10T00:00:00.000Z'),
    },
    vi.fn(),
  ]),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

vi.mock('@ui/calendar/content-calendar/ContentCalendar', () => ({
  default: ({
    items,
    modal,
    onEventClick,
  }: {
    items: Array<{ id: string }>;
    modal: ReactNode;
    onEventClick: (item: { id: string }) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onEventClick(items[0])}>
        Open post
      </button>
      {modal}
    </div>
  ),
}));

vi.mock('@pages/posts/detail/PostDetailOverlay', () => ({
  default: ({ postId, scope }: { postId: string | null; scope: PageScope }) => (
    <div data-testid="post-detail-overlay">
      {postId ?? 'closed'}:{scope}
    </div>
  ),
}));

describe('PostsCalendarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllMock.mockResolvedValue([
      {
        id: 'post-123',
        label: 'Launch post',
        platform: 'instagram',
        scheduledDate: '2026-03-12T10:00:00.000Z',
        status: 'draft',
      },
    ]);
  });

  it('opens the shared post overlay when a calendar post is clicked', async () => {
    render(<PostsCalendarPage scope={PageScope.PUBLISHER} />);

    await waitFor(() => {
      expect(findAllMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open post' }));

    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      `post-123:${PageScope.PUBLISHER}`,
    );
  });
});
