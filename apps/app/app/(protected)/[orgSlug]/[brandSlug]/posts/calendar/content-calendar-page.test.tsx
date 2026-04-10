import { PageScope } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContentCalendarPage from './content-calendar-page';
import '@testing-library/jest-dom';

const findPostsMock = vi.fn();
const findArticlesMock = vi.fn();
const pushMock = vi.fn();
const useAuthedServiceMock = vi.fn();
let useAuthedServiceCallCount = 0;

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-123',
    organizationId: 'org-123',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (...args: unknown[]) => useAuthedServiceMock(...args),
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

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: pushMock,
  })),
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
        Open first item
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

describe('ContentCalendarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthedServiceCallCount = 0;
    useAuthedServiceMock.mockImplementation(() => {
      useAuthedServiceCallCount += 1;

      if (useAuthedServiceCallCount % 2 === 1) {
        return vi.fn(async () => ({ findAll: findPostsMock }));
      }

      return vi.fn(async () => ({ findAll: findArticlesMock }));
    });
    findPostsMock.mockResolvedValue([
      {
        id: 'post-456',
        label: 'Campaign post',
        platform: 'instagram',
        scheduledDate: '2026-03-12T10:00:00.000Z',
        status: 'draft',
      },
    ]);
    findArticlesMock.mockResolvedValue([]);
  });

  it('opens the shared post overlay when a calendar post is clicked', async () => {
    render(<ContentCalendarPage />);

    await waitFor(() => {
      expect(findPostsMock).toHaveBeenCalled();
      expect(findArticlesMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open first item' }));

    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      `post-456:${PageScope.PUBLISHER}`,
    );
  });
});
