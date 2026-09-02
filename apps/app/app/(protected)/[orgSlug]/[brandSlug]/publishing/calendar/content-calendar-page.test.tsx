import {
  ArticleStatus,
  CalendarSlotState,
  CredentialPlatform,
  PostCategory,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/contracts';
import type {
  ICalendarSlot,
  IChannelTarget,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import type {
  CalendarEventAction,
  CalendarEventBadge,
  CalendarEventChannel,
  CalendarEventDrop,
  CalendarViewKey,
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
import {
  CALENDAR_DEFAULT_EVENT_COLOR,
  CALENDAR_SLOT_EVENT_COLOR,
} from './calendar-item-color.helper';
import ContentCalendarPage from './content-calendar-page';
import '@testing-library/jest-dom/vitest';

interface CalendarItemShape {
  article?: { tags?: Array<{ backgroundColor?: string }> };
  filledCount?: number;
  id: string;
  itemType: 'article' | 'day-aggregate' | 'release' | 'slot';
  missingCount?: number;
  missingIdentityKeys?: string[];
  release?: { firstTagColor?: string | null };
  status: string;
}

const { notifyErrorMock, openConfirmMock, openPostRepurposeModalMock } =
  vi.hoisted(() => ({
    notifyErrorMock: vi.fn(),
    openConfirmMock: vi.fn(),
    openPostRepurposeModalMock: vi.fn(),
  }));

const findArticlesMock = vi.fn();
const findReleasesMock = vi.fn();
const updateReleaseMock = vi.fn();
const updateTargetMock = vi.fn();
const moveCalendarPlacementMock = vi.fn();
const republishAtMock = vi.fn();
const pushMock = vi.fn();
const setDateRangeMock = vi.fn();
const useAuthedServiceMock = vi.fn();
const calendarDateRange = {
  end: new Date('2026-03-16T00:00:00.000Z'),
  start: new Date('2026-03-10T00:00:00.000Z'),
};

const getArticlesServiceMock = vi.fn(async () => ({
  findAll: findArticlesMock,
}));
const repurposeMock = vi.fn();
const getPostsServiceMock = vi.fn(async () => ({
  repurpose: repurposeMock,
}));
const getReleaseGroupsServiceMock = vi.fn(async () => ({
  findAll: findReleasesMock,
  moveCalendarPlacement: moveCalendarPlacementMock,
  republishAt: republishAtMock,
  update: updateReleaseMock,
  updateTarget: updateTargetMock,
}));
const listSlotsMock = vi.fn(async () => []);
const listCadencesMock = vi.fn(async () => []);
const skipSlotMock = vi.fn();
const cancelSlotMock = vi.fn();
const writeSlotMock = vi.fn();
const generateSlotMock = vi.fn();
const generateBulkMock = vi.fn();
const getPostingCadencesServiceMock = vi.fn(async () => ({
  book: vi.fn(),
  cancel: cancelSlotMock,
  create: vi.fn(),
  delete: vi.fn(),
  generate: generateSlotMock,
  generateBulk: generateBulkMock,
  list: listCadencesMock,
  listSlots: listSlotsMock,
  skip: skipSlotMock,
  update: vi.fn(),
  write: writeSlotMock,
}));

const calendarRenderProps: Array<{
  getEventActions: (item: CalendarItemShape) => CalendarEventAction[];
  getEventBadge: (item: CalendarItemShape) => CalendarEventBadge | null;
  getEventChannels: (item: CalendarItemShape) => CalendarEventChannel[];
  getEventColor: (item: CalendarItemShape) => string;
  isItemDraggable: (item: CalendarItemShape) => boolean;
  isLoading: boolean;
  items: CalendarItemShape[];
  onEventDrop: (change: CalendarEventDrop<CalendarItemShape>) => void;
  onViewChange?: (view: CalendarViewKey) => void;
  preferredTimes: Array<{ hour: number; minute: number }>;
  timezone: string;
}> = [];
let useAuthedServiceCallCount = 0;

// The calendar page resolves the repurpose modal from the global-modals
// provider, which this suite renders outside of.
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({
    closeConfirm: vi.fn(),
    openConfirm: openConfirmMock,
  }),
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
        postingTimes: [
          { hour: 9, minute: 0 },
          { hour: 18, minute: 0 },
        ],
      },
    ],
    organizationId: 'org-123',
    selectedBrand: {
      agentConfig: { schedule: { timezone: 'Europe/Malta' } },
    },
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (...args: unknown[]) => useAuthedServiceMock(...args),
}));

vi.mock('@hooks/utils/use-calendar-week-range/use-calendar-week-range', () => ({
  useCalendarWeekRange: vi.fn(() => [calendarDateRange, setDateRangeMock]),
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
  usePathname: () => '/acme-org/acme-creator/publishing/calendar',
  useRouter: vi.fn(() => ({
    push: pushMock,
  })),
}));

vi.mock('@ui/calendar/content-calendar/ContentCalendar', () => ({
  default: ({
    filterControls,
    getEventActions,
    getEventBadge,
    getEventChannels,
    getEventColor,
    isItemDraggable,
    isLoading,
    items,
    modal,
    onEventClick,
    onEventDrop,
    onViewChange,
    preferredTimes,
    timezone,
  }: {
    filterControls: ReactNode;
    getEventActions?: (item: CalendarItemShape) => CalendarEventAction[];
    getEventBadge: (item: CalendarItemShape) => CalendarEventBadge | null;
    getEventChannels: (item: CalendarItemShape) => CalendarEventChannel[];
    getEventColor: (item: CalendarItemShape) => string;
    isItemDraggable: (item: CalendarItemShape) => boolean;
    isLoading?: boolean;
    items: CalendarItemShape[];
    modal: ReactNode;
    onEventClick: (item: CalendarItemShape) => void;
    onEventDrop: (change: CalendarEventDrop<CalendarItemShape>) => void;
    onViewChange?: (view: CalendarViewKey) => void;
    preferredTimes?: Array<{ hour: number; minute: number }>;
    timezone?: string;
  }) => {
    calendarRenderProps.push({
      getEventActions: getEventActions ?? (() => []),
      getEventBadge,
      getEventChannels,
      getEventColor,
      isItemDraggable,
      isLoading: Boolean(isLoading),
      items,
      onEventDrop,
      onViewChange,
      preferredTimes: preferredTimes ?? [],
      timezone: timezone ?? 'UTC',
    });

    return (
      <div>
        {filterControls}
        {items.map((item) => (
          <div key={item.id}>
            <button type="button" onClick={() => onEventClick(item)}>
              {`open:${item.id}`}
            </button>
            {(getEventActions?.(item) ?? []).map((action) => (
              <button
                key={`${item.id}:${action.id}`}
                type="button"
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
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

vi.mock(
  '@pages/posts/release/release-detail-drawer',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@pages/posts/release/release-detail-drawer')
      >();

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
  },
);

vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@ui/primitives/alert', () => ({
  Alert: ({ children }: { children: ReactNode }) => (
    <div role="alert">{children}</div>
  ),
  AlertDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  AlertTitle: ({ children }: { children: ReactNode }) => (
    <strong>{children}</strong>
  ),
}));

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
    scheduledAt: '2026-12-12T10:00:00.000Z',
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
    listSlotsMock.mockResolvedValue([]);
    listCadencesMock.mockResolvedValue([]);
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

  it('forwards credential posting times and brand timezone to day view', async () => {
    await renderLoaded();

    expect(latestCalendarProps().preferredTimes).toEqual([
      { hour: 9, minute: 0 },
      { hour: 18, minute: 0 },
    ]);
    expect(latestCalendarProps().timezone).toBe('Europe/Malta');
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
      '/acme-org/acme-creator/publishing/posts/article-9',
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

  it('colors tagged releases and articles from the first tag on day week and month', async () => {
    findArticlesMock.mockResolvedValue([
      {
        createdAt: '2026-03-11T10:00:00.000Z',
        id: 'article-9',
        label: 'Launch essay',
        status: ArticleStatus.DRAFT,
        tags: [{ backgroundColor: '#f97316' }, { backgroundColor: '#22c55e' }],
      },
    ]);
    findReleasesMock.mockResolvedValue([
      release({ firstTagColor: '#ef4444' }),
      release({
        firstTagColor: null,
        id: 'release-untagged',
        title: 'Untagged',
      }),
    ]);

    await renderLoaded();

    const { getEventColor, items } = latestCalendarProps();
    const taggedRelease = items.find((item) => item.id === 'release-1');
    const untaggedRelease = items.find(
      (item) => item.id === 'release-untagged',
    );
    const taggedArticle = items.find((item) => item.id === 'article-9');

    expect(getEventColor(taggedRelease as CalendarItemShape)).toBe('#ef4444');
    expect(getEventColor(untaggedRelease as CalendarItemShape)).toBe(
      CALENDAR_DEFAULT_EVENT_COLOR,
    );
    expect(getEventColor(taggedArticle as CalendarItemShape)).toBe('#f97316');
  });

  it('does not paint missing ghosts with a tag color', async () => {
    listSlotsMock.mockResolvedValue([
      calendarSlot({
        identityKey: 'missing-slot',
        state: CalendarSlotState.MISSING,
      }),
      calendarSlot({
        identityKey: 'generating-slot',
        state: CalendarSlotState.GENERATING,
      }),
      calendarSlot({
        identityKey: 'failed-slot',
        state: CalendarSlotState.GENERATE_FAILED,
      }),
    ]);
    findReleasesMock.mockResolvedValue([release({ firstTagColor: '#ef4444' })]);

    await renderLoaded();

    const { getEventColor, items } = latestCalendarProps();

    expect(
      getEventColor(
        items.find((item) => item.id === 'missing-slot') as CalendarItemShape,
      ),
    ).toBe(CALENDAR_SLOT_EVENT_COLOR);
    expect(
      getEventColor(
        items.find(
          (item) => item.id === 'generating-slot',
        ) as CalendarItemShape,
      ),
    ).toBe(CALENDAR_SLOT_EVENT_COLOR);
    expect(
      getEventColor(
        items.find((item) => item.id === 'failed-slot') as CalendarItemShape,
      ),
    ).toBe(CALENDAR_SLOT_EVENT_COLOR);
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

  it('refuses to drag a cancelled release and lets a published card be moved', async () => {
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
      release({
        id: 'release-3',
        status: ReleaseStatus.CANCELLED,
        targets: [
          target({
            executionState: TargetExecutionState.CANCELLED,
            id: 'target-3',
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
    ).toBe(true);
    expect(
      isItemDraggable(
        items.find((item) => item.id === 'release-3') as CalendarItemShape,
      ),
    ).toBe(false);
  });

  it('persists a drag as a release-level reschedule', async () => {
    updateReleaseMock.mockResolvedValue(
      release({ scheduledAt: '2026-12-13T10:00:00.000Z' }),
    );

    await renderLoaded();

    const revert = vi.fn();
    const { items, onEventDrop } = latestCalendarProps();
    act(() => {
      onEventDrop({
        item: items[0],
        revert,
        start: new Date('2026-12-13T10:00:00.000Z'),
      });
    });

    await waitFor(() => {
      expect(updateReleaseMock).toHaveBeenCalledWith('release-1', {
        scheduledDate: '2026-12-13T10:00:00.000Z',
      });
    });
    expect(revert).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks before moving a published card and reverts when cancelled', async () => {
    findReleasesMock.mockResolvedValue([
      release({
        status: ReleaseStatus.PUBLISHED,
        targets: [target({ executionState: TargetExecutionState.PUBLISHED })],
      }),
    ]);

    await renderLoaded();

    const revert = vi.fn();
    const { items, onEventDrop } = latestCalendarProps();
    act(() => {
      onEventDrop({
        item: items[0],
        revert,
        start: new Date('2026-12-13T10:00:00.000Z'),
      });
    });

    expect(
      screen.getByRole('heading', { name: 'Move the card or publish again?' }),
    ).toBeInTheDocument();
    expect(updateReleaseMock).not.toHaveBeenCalled();
    expect(moveCalendarPlacementMock).not.toHaveBeenCalled();
    expect(republishAtMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(revert).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves a published card without creating a second publish', async () => {
    findReleasesMock.mockResolvedValue([
      release({
        status: ReleaseStatus.PUBLISHED,
        targets: [target({ executionState: TargetExecutionState.PUBLISHED })],
      }),
    ]);
    moveCalendarPlacementMock.mockResolvedValue(
      release({
        scheduledAt: '2026-12-13T10:00:00.000Z',
        status: ReleaseStatus.PUBLISHED,
      }),
    );

    await renderLoaded();

    const revert = vi.fn();
    const { items, onEventDrop } = latestCalendarProps();
    act(() => {
      onEventDrop({
        item: items[0],
        revert,
        start: new Date('2026-12-13T10:00:00.000Z'),
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Move card only' }));

    await waitFor(() => {
      expect(moveCalendarPlacementMock).toHaveBeenCalledWith(
        'release-1',
        '2026-12-13T10:00:00.000Z',
      );
    });
    expect(republishAtMock).not.toHaveBeenCalled();
    expect(updateReleaseMock).not.toHaveBeenCalled();
    expect(revert).not.toHaveBeenCalled();
  });

  it('republishes a published card as a new scheduled occurrence', async () => {
    findReleasesMock.mockResolvedValue([
      release({
        status: ReleaseStatus.PUBLISHED,
        targets: [target({ executionState: TargetExecutionState.PUBLISHED })],
      }),
    ]);
    republishAtMock.mockResolvedValue(
      release({
        id: 'release-2',
        scheduledAt: '2026-12-13T10:00:00.000Z',
        status: ReleaseStatus.SCHEDULED,
      }),
    );

    await renderLoaded();

    const revert = vi.fn();
    const { items, onEventDrop } = latestCalendarProps();
    act(() => {
      onEventDrop({
        item: items[0],
        revert,
        start: new Date('2026-12-13T10:00:00.000Z'),
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Publish again' }));

    await waitFor(() => {
      expect(republishAtMock).toHaveBeenCalledWith(
        'release-1',
        '2026-12-13T10:00:00.000Z',
      );
    });
    expect(moveCalendarPlacementMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        latestCalendarProps().items.some((item) => item.id === 'release-2'),
      ).toBe(true);
    });
  });

  it('asks the same question for a queued item whose time has already passed', async () => {
    findReleasesMock.mockResolvedValue([
      release({ scheduledAt: '2026-03-12T10:00:00.000Z' }),
    ]);

    await renderLoaded();

    const revert = vi.fn();
    const { items, onEventDrop } = latestCalendarProps();
    act(() => {
      onEventDrop({
        item: items[0],
        revert,
        start: new Date('2026-12-13T10:00:00.000Z'),
      });
    });

    expect(
      screen.getByRole('heading', { name: 'Move the card or publish again?' }),
    ).toBeInTheDocument();
    expect(updateReleaseMock).not.toHaveBeenCalled();
  });

  it('reverts a published drag when republish is rejected', async () => {
    findReleasesMock.mockResolvedValue([
      release({
        status: ReleaseStatus.PUBLISHED,
        targets: [target({ executionState: TargetExecutionState.PUBLISHED })],
      }),
    ]);
    republishAtMock.mockRejectedValue(
      new Error('scheduledAt must be now or in the future.'),
    );

    await renderLoaded();

    const revert = vi.fn();
    const { items, onEventDrop } = latestCalendarProps();
    act(() => {
      onEventDrop({
        item: items[0],
        revert,
        start: new Date('2026-12-13T10:00:00.000Z'),
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Publish again' }));

    await waitFor(() => {
      expect(revert).toHaveBeenCalled();
    });
    expect(notifyErrorMock).toHaveBeenCalledWith(
      'scheduledAt must be now or in the future.',
    );
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
        start: new Date('2026-12-13T10:00:00.000Z'),
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

  it('badges missing slots and leaves skipped or filled holes off the calendar', async () => {
    listSlotsMock.mockResolvedValue([
      calendarSlot({
        identityKey: 'missing-slot',
        state: CalendarSlotState.MISSING,
      }),
    ]);

    await renderLoaded();

    const { getEventBadge, items } = latestCalendarProps();
    const missingItem = items.find((item) => item.id === 'missing-slot');

    expect(missingItem).toBeDefined();
    expect(getEventBadge(missingItem as CalendarItemShape)).toEqual({
      label: 'missing',
      tone: 'muted',
    });
    expect(
      items.some(
        (item) =>
          item.status === CalendarSlotState.SKIPPED ||
          item.status === CalendarSlotState.FILLED,
      ),
    ).toBe(false);
  });

  it('skips a missing slot and drops it from the calendar', async () => {
    listSlotsMock.mockResolvedValue([calendarSlot({ identityKey: 'skip-me' })]);
    skipSlotMock.mockResolvedValue(
      calendarSlot({
        identityKey: 'skip-me',
        state: CalendarSlotState.SKIPPED,
      }),
    );

    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'open:skip-me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    await waitFor(() => {
      expect(skipSlotMock).toHaveBeenCalledWith('skip-me');
    });
    await waitFor(() => {
      expect(
        latestCalendarProps().items.some((item) => item.id === 'skip-me'),
      ).toBe(false);
    });
  });

  it('writes an article slot into the article editor', async () => {
    listSlotsMock.mockResolvedValue([
      calendarSlot({
        format: PostCategory.ARTICLE,
        identityKey: 'article-slot',
      }),
    ]);
    writeSlotMock.mockResolvedValue(
      calendarSlot({
        format: PostCategory.ARTICLE,
        generatedItemId: 'article-slot-1',
        identityKey: 'article-slot',
        state: CalendarSlotState.FILLED,
      }),
    );

    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'open:article-slot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write' }));

    await waitFor(() => {
      expect(writeSlotMock).toHaveBeenCalledWith('article-slot');
    });
    expect(pushMock).toHaveBeenCalledWith(
      '/acme-org/acme-creator/publishing/posts/article-slot-1',
    );
  });

  it('confirms bulk generate with the missing-slot count before starting', async () => {
    listSlotsMock.mockResolvedValue([
      calendarSlot({ identityKey: 'ghost-1' }),
      calendarSlot({
        identityKey: 'ghost-2',
        instant: '2026-03-12T12:00:00.000Z',
      }),
    ]);
    generateBulkMock.mockResolvedValue({
      completed: [
        calendarSlot({ identityKey: 'ghost-1' }),
        calendarSlot({ identityKey: 'ghost-2' }),
      ],
      completedCount: 2,
      isCancelled: false,
      isCreditsExhausted: false,
      remainingCount: 0,
      remainingIdentityKeys: [],
    });
    openConfirmMock.mockImplementation(
      ({ onConfirm }: { onConfirm: () => void }) => {
        onConfirm();
      },
    );

    await renderLoaded();

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate missing (2)' }),
    );

    expect(openConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Generate 2',
        label: 'Generate 2 missing slots?',
        message: expect.stringContaining('2 missing slots'),
      }),
    );
    await waitFor(() => {
      expect(generateBulkMock).toHaveBeenCalledWith(
        {
          confirmedCount: 2,
          identityKeys: ['ghost-1', 'ghost-2'],
        },
        expect.any(AbortSignal),
      );
    });
  });

  it('aggregates dense ghosts in month view instead of drawing each slot', async () => {
    listSlotsMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) =>
        calendarSlot({
          identityKey: `ghost-${index}`,
          instant: `2026-03-12T${String(8 + index).padStart(2, '0')}:00:00.000Z`,
        }),
      ),
    );

    await renderLoaded();

    expect(
      latestCalendarProps().items.filter((item) => item.itemType === 'slot'),
    ).toHaveLength(12);

    act(() => {
      latestCalendarProps().onViewChange?.('month');
    });

    await waitFor(() => {
      const items = latestCalendarProps().items;
      expect(items.some((item) => item.itemType === 'slot')).toBe(false);
      expect(items.some((item) => item.id === 'day:2026-03-12')).toBe(true);
    });

    const aggregate = latestCalendarProps().items.find(
      (item) => item.id === 'day:2026-03-12',
    );
    expect(aggregate?.missingCount).toBe(12);
    expect(aggregate?.filledCount).toBe(0);
  });

  it('exposes Generate as a real button on a focused missing slot', async () => {
    listSlotsMock.mockResolvedValue([
      calendarSlot({ identityKey: 'missing-slot' }),
    ]);
    generateSlotMock.mockResolvedValue(
      calendarSlot({
        identityKey: 'missing-slot',
        state: CalendarSlotState.FILLED,
      }),
    );

    await renderLoaded();

    const generate = screen.getByRole('button', { name: 'Generate' });
    expect(generate).toBeVisible();
    fireEvent.click(generate);

    await waitFor(() => {
      expect(generateSlotMock).toHaveBeenCalledWith({
        identityKey: 'missing-slot',
      });
    });
  });
});

function calendarSlot(overrides: Partial<ICalendarSlot> = {}): ICalendarSlot {
  return {
    brandId: 'brand-123',
    cadenceId: 'cadence-1',
    credentialId: 'credential-1',
    format: PostCategory.REEL,
    generatedItemId: null,
    generatedItemType: null,
    id: overrides.identityKey ?? 'slot-1',
    identityKey: 'slot-1',
    instant: '2026-03-12T10:00:00.000Z',
    lastFailureReason: null,
    resolvedBrief: 'Ship in public',
    state: CalendarSlotState.MISSING,
    timezone: 'UTC',
    ...overrides,
  };
}
