import {
  CredentialPlatform,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import type { IChannelTarget, IReleaseGroup } from '@genfeedai/interfaces';
import type {
  CalendarEventBadge,
  CalendarEventChannel,
  CalendarEventDrop,
} from '@props/components/calendar.props';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContentCalendarPage from './content-calendar-page';
import '@testing-library/jest-dom/vitest';

interface CalendarItemShape {
  id: string;
  itemType: 'article' | 'release';
  status: string;
}

const { notifyErrorMock, openPostRepurposeModalMock } = vi.hoisted(() => ({
  notifyErrorMock: vi.fn(),
  openPostRepurposeModalMock: vi.fn(),
}));

const findArticlesMock = vi.fn();
const findReleasesMock = vi.fn();
const updateReleaseMock = vi.fn();
const updateTargetMock = vi.fn();
const pushMock = vi.fn();
const setDateRangeMock = vi.fn();
const useAuthedServiceMock = vi.fn();

const getArticlesServiceMock = vi.fn(async () => ({
  findAll: findArticlesMock,
}));
const repurposeMock = vi.fn();
const getPostsServiceMock = vi.fn(async () => ({
  repurpose: repurposeMock,
}));
const getReleaseGroupsServiceMock = vi.fn(async () => ({
  findAll: findReleasesMock,
  update: updateReleaseMock,
  updateTarget: updateTargetMock,
}));
const listSlotsMock = vi.fn(async () => []);
const getPostingCadencesServiceMock = vi.fn(async () => ({
  book: vi.fn(),
  create: vi.fn(),
  generate: vi.fn(),
  listSlots: listSlotsMock,
  write: vi.fn(),
}));

const calendarRenderProps: Array<{
  getEventBadge: (item: CalendarItemShape) => CalendarEventBadge | null;
  getEventChannels: (item: CalendarItemShape) => CalendarEventChannel[];
  isItemDraggable: (item: CalendarItemShape) => boolean;
  isLoading: boolean;
  items: CalendarItemShape[];
  onEventDrop: (change: CalendarEventDrop<CalendarItemShape>) => void;
}> = [];
let useAuthedServiceCallCount = 0;

// The calendar page resolves the repurpose modal from the global-modals
// provider, which this suite renders outside of.
vi.mock('@providers/global-modals/global-modals.provider', () => ({
  usePostRepurposeModal: () => ({
    openPostRepurposeModal: openPostRepurposeModalMock,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-123',
    credentials: [
      {
        id: 'credential-1',
        label: '@acme',
        platform: 'instagram',
      },
    ],
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
    setDateRangeMock,
  ]),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: notifyErrorMock,
      success: vi.fn(),
    })),
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'acme-creator', orgSlug: 'acme-org' }),
  usePathname: () => '/acme-org/acme-creator/publish/calendar',
  useRouter: vi.fn(() => ({
    push: pushMock,
  })),
}));

vi.mock('@ui/calendar/content-calendar/ContentCalendar', () => ({
  default: ({
    filterControls,
    getEventBadge,
    getEventChannels,
    isItemDraggable,
    isLoading,
    items,
    modal,
    onEventClick,
    onEventDrop,
  }: {
    filterControls: ReactNode;
    getEventBadge: (item: CalendarItemShape) => CalendarEventBadge | null;
    getEventChannels: (item: CalendarItemShape) => CalendarEventChannel[];
    isItemDraggable: (item: CalendarItemShape) => boolean;
    isLoading?: boolean;
    items: CalendarItemShape[];
    modal: ReactNode;
    onEventClick: (item: CalendarItemShape) => void;
    onEventDrop: (change: CalendarEventDrop<CalendarItemShape>) => void;
  }) => {
    calendarRenderProps.push({
      getEventBadge,
      getEventChannels,
      isItemDraggable,
      isLoading: Boolean(isLoading),
      items,
      onEventDrop,
    });

    return (
      <div>
        {filterControls}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onEventClick(item)}
          >
            {`open:${item.id}`}
          </button>
        ))}
        {modal}
      </div>
    );
  },
}));

vi.mock('./release-calendar-filters', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./release-calendar-filters')>();

  return {
    ...actual,
    default: ({
      filters,
      onChange,
    }: {
      filters: { status: string[] };
      onChange: (next: unknown) => void;
    }) => (
      <div>
        <button
          type="button"
          onClick={() =>
            onChange({ ...filters, status: [ReleaseStatus.SCHEDULED] })
          }
        >
          Filter scheduled
        </button>
      </div>
    ),
  };
});

vi.mock('./release-detail-drawer', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./release-detail-drawer')>();

  return {
    ...actual,
    default: ({
      error,
      onRescheduleRelease,
      onRescheduleTarget,
      onRetryTarget,
      pendingAction,
      reconnectHref,
      release,
    }: {
      error: string | null;
      onRescheduleRelease: (scheduledDate: string) => void;
      onRescheduleTarget: (targetId: string, scheduledDate: string) => void;
      onRetryTarget: (targetId: string) => void;
      pendingAction: string | null;
      reconnectHref: string;
      release: { id: string } | null;
    }) => (
      <div data-testid="release-drawer">
        <span data-testid="reconnect-href">{reconnectHref}</span>
        <span data-testid="drawer-release">{release?.id ?? 'closed'}</span>
        <span data-testid="drawer-pending">{pendingAction ?? 'idle'}</span>
        {error ? <span data-testid="drawer-error">{error}</span> : null}
        <button
          type="button"
          onClick={() => onRescheduleRelease('2026-03-14T10:00:00.000Z')}
        >
          Reschedule post
        </button>
        <button
          type="button"
          onClick={() =>
            onRescheduleTarget('target-1', '2026-03-14T12:00:00.000Z')
          }
        >
          Reschedule target
        </button>
        <button type="button" onClick={() => onRetryTarget('target-1')}>
          Retry target
        </button>
      </div>
    ),
  };
});

vi.mock('./evergreen-series-controls', () => ({
  default: ({ groupId }: { groupId: string }) => (
    <div data-testid="evergreen-series-controls">{groupId}</div>
  ),
}));

function target(overrides: Partial<IChannelTarget> = {}): IChannelTarget {
  return {
    executionState: TargetExecutionState.SCHEDULED,
    id: 'target-1',
    platform: CredentialPlatform.INSTAGRAM,
    retryCount: 0,
    source: ReleaseTargetSource.MANUAL,
    timezone: 'UTC',
    validationIssues: [],
    validationState: TargetValidationState.VALID,
    ...overrides,
  } as IChannelTarget;
}

function release(overrides: Partial<IReleaseGroup> = {}): IReleaseGroup {
  return {
    id: 'release-1',
    scheduledAt: '2026-03-12T10:00:00.000Z',
    status: ReleaseStatus.SCHEDULED,
    targets: [target()],
    timezone: 'UTC',
    title: 'Campaign release',
    ...overrides,
  } as IReleaseGroup;
}

function latestCalendarProps() {
  const latest = calendarRenderProps.at(-1);
  if (!latest) {
    throw new Error('ContentCalendar has not rendered yet');
  }

  return latest;
}

async function renderLoaded() {
  render(<ContentCalendarPage />);

  await waitFor(() => {
    expect(findReleasesMock).toHaveBeenCalled();
    expect(calendarRenderProps.at(-1)?.items.length ?? 0).toBeGreaterThan(0);
  });
}

describe('ContentCalendarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calendarRenderProps.length = 0;
    useAuthedServiceCallCount = 0;
    // The page resolves four services per render, in declaration order:
    // articles, release groups, posting cadences, then posts.
    const servicesInCallOrder = [
      getArticlesServiceMock,
      getReleaseGroupsServiceMock,
      getPostingCadencesServiceMock,
      getPostsServiceMock,
    ];
    useAuthedServiceMock.mockImplementation(() => {
      const service =
        servicesInCallOrder[
          useAuthedServiceCallCount % servicesInCallOrder.length
        ];
      useAuthedServiceCallCount += 1;

      return service;
    });
    findArticlesMock.mockResolvedValue([]);
    findReleasesMock.mockResolvedValue([release()]);
  });

  it('queries the scheduler read model for the visible window only', async () => {
    await renderLoaded();

    expect(findReleasesMock).toHaveBeenCalledWith(
      {
        brandId: 'brand-123',
        endDate: '2026-03-16T00:00:00.000Z',
        startDate: '2026-03-10T00:00:00.000Z',
      },
      expect.any(AbortSignal),
    );
  });

  it('adds a chosen facet to the query and leaves unset facets out', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'Filter scheduled' }));

    await waitFor(() => {
      expect(findReleasesMock).toHaveBeenLastCalledWith(
        {
          brandId: 'brand-123',
          endDate: '2026-03-16T00:00:00.000Z',
          startDate: '2026-03-10T00:00:00.000Z',
          status: [ReleaseStatus.SCHEDULED],
        },
        expect.any(AbortSignal),
      );
    });
  });

  it('opens the release drawer instead of routing away', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'open:release-1' }));

    expect(screen.getByTestId('drawer-release')).toHaveTextContent('release-1');
    expect(screen.getByTestId('reconnect-href')).toHaveTextContent(
      '/acme-org/acme-creator/settings/social',
    );
    expect(screen.getByTestId('evergreen-series-controls')).toHaveTextContent(
      'release-1',
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('sends an article to its dedicated editor rather than the release drawer', async () => {
    findArticlesMock.mockResolvedValue([
      {
        createdAt: '2026-03-11T10:00:00.000Z',
        id: 'article-9',
        label: 'Launch essay',
        status: 'draft',
      },
    ]);

    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'open:article-9' }));

    expect(pushMock).toHaveBeenCalledWith(
      '/acme-org/acme-creator/publish/posts/article-9?returnTo=%2Facme-org%2Facme-creator%2Fpublish%2Fcalendar',
    );
    expect(screen.getByTestId('drawer-release')).toHaveTextContent('closed');
  });

  it('badges releases and leaves articles unbadged', async () => {
    await renderLoaded();

    const { getEventBadge, items } = latestCalendarProps();
    const releaseItem = items.find((item) => item.itemType === 'release');

    expect(getEventBadge(releaseItem as CalendarItemShape)).toEqual({
      label: ReleaseStatus.SCHEDULED,
      tone: 'info',
    });
    expect(
      getEventBadge({
        id: 'article-9',
        itemType: 'article',
        status: 'draft',
      }),
    ).toBeNull();
  });

  it('does not throw when a release target relationship collapses to a non-array', async () => {
    findReleasesMock.mockResolvedValue([
      release({
        scheduledAt: undefined,
        targets: {
          id: 'target-1',
          platform: CredentialPlatform.INSTAGRAM,
          scheduledAt: '2026-03-12T10:00:00.000Z',
        } as unknown as IChannelTarget[],
      }),
    ]);

    await renderLoaded();

    const { getEventChannels, items } = latestCalendarProps();
    const releaseItem = items.find((item) => item.itemType === 'release');

    expect(() =>
      getEventChannels(releaseItem as CalendarItemShape),
    ).not.toThrow();
    expect(getEventChannels(releaseItem as CalendarItemShape)).toEqual([]);
  });

  it('does not throw when targets collapse to a string', async () => {
    findReleasesMock.mockResolvedValue([
      release({
        targets: 'target-1' as unknown as IChannelTarget[],
      }),
    ]);

    await renderLoaded();

    const { getEventChannels, items } = latestCalendarProps();
    const releaseItem = items.find((item) => item.itemType === 'release');

    expect(() =>
      getEventChannels(releaseItem as CalendarItemShape),
    ).not.toThrow();
    expect(getEventChannels(releaseItem as CalendarItemShape)).toEqual([]);
  });

  it('derives one channel icon per distinct platform and none for articles', async () => {
    findReleasesMock.mockResolvedValue([
      release({
        targets: [
          target(),
          target({ id: 'target-2' }),
          target({ id: 'target-3', platform: CredentialPlatform.YOUTUBE }),
        ],
      }),
    ]);

    await renderLoaded();

    const { getEventChannels, items } = latestCalendarProps();
    const releaseItem = items.find((item) => item.itemType === 'release');

    expect(getEventChannels(releaseItem as CalendarItemShape)).toEqual([
      { id: 'instagram', label: 'Instagram' },
      { id: 'youtube', label: 'YouTube' },
    ]);
    expect(
      getEventChannels({
        id: 'article-9',
        itemType: 'article',
        status: 'draft',
      }),
    ).toEqual([]);
  });

  it('refuses to drag a release that can no longer be moved', async () => {
    findReleasesMock.mockResolvedValue([
      release(),
      release({
        id: 'release-2',
        status: ReleaseStatus.PUBLISHED,
        targets: [
          target({
            executionState: TargetExecutionState.PUBLISHED,
            id: 'target-2',
          }),
        ],
      }),
    ]);

    await renderLoaded();

    const { isItemDraggable, items } = latestCalendarProps();

    expect(
      isItemDraggable(
        items.find((item) => item.id === 'release-1') as CalendarItemShape,
      ),
    ).toBe(true);
    expect(
      isItemDraggable(
        items.find((item) => item.id === 'release-2') as CalendarItemShape,
      ),
    ).toBe(false);
  });

  it('persists a drag as a release-level reschedule', async () => {
    updateReleaseMock.mockResolvedValue(
      release({ scheduledAt: '2026-03-13T10:00:00.000Z' }),
    );

    await renderLoaded();

    const revert = vi.fn();
    const { items, onEventDrop } = latestCalendarProps();
    act(() => {
      onEventDrop({
        item: items[0],
        revert,
        start: new Date('2026-03-13T10:00:00.000Z'),
      });
    });

    await waitFor(() => {
      expect(updateReleaseMock).toHaveBeenCalledWith('release-1', {
        scheduledDate: '2026-03-13T10:00:00.000Z',
      });
    });
    expect(revert).not.toHaveBeenCalled();
  });

  it('reverts the dragged event when the API rejects the new slot', async () => {
    updateReleaseMock.mockRejectedValue(
      new Error('Instagram is not publish-capable.'),
    );

    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'open:release-1' }));

    const revert = vi.fn();
    const { items, onEventDrop } = latestCalendarProps();
    act(() => {
      onEventDrop({
        item: items[0],
        revert,
        start: new Date('2026-03-13T10:00:00.000Z'),
      });
    });

    await waitFor(() => {
      expect(revert).toHaveBeenCalled();
    });
    expect(screen.getByTestId('drawer-error')).toHaveTextContent(
      'Instagram is not publish-capable.',
    );
    expect(notifyErrorMock).toHaveBeenCalledWith(
      'Instagram is not publish-capable.',
    );
  });

  it('reschedules a single target through the nested endpoint', async () => {
    updateTargetMock.mockResolvedValue(release());

    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'open:release-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reschedule target' }));

    await waitFor(() => {
      expect(updateTargetMock).toHaveBeenCalledWith('release-1', 'target-1', {
        scheduledDate: '2026-03-14T12:00:00.000Z',
      });
    });
  });

  it('expresses a manual retry as a transition back to scheduled', async () => {
    updateTargetMock.mockResolvedValue(release());

    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'open:release-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry target' }));

    await waitFor(() => {
      expect(updateTargetMock).toHaveBeenCalledWith('release-1', 'target-1', {
        executionState: TargetExecutionState.SCHEDULED,
      });
    });
  });

  it('replaces the release in place with whatever the server returned', async () => {
    updateReleaseMock.mockResolvedValue(
      release({ title: 'Campaign release (moved)' }),
    );

    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'open:release-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reschedule post' }));

    await waitFor(() => {
      expect(updateReleaseMock).toHaveBeenCalledWith('release-1', {
        scheduledDate: '2026-03-14T10:00:00.000Z',
      });
    });
    await waitFor(() => {
      expect(latestCalendarProps().items).toHaveLength(1);
    });
    expect(screen.getByTestId('drawer-pending')).toHaveTextContent('idle');
  });
});
