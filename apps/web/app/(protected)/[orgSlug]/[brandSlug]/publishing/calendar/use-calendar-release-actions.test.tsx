import { ReleaseStatus } from '@genfeedai/contracts';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import type { ReleaseGroupsService } from '@services/content/release-groups.service';
import type { NotificationsService } from '@services/core/notifications.service';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ContentCalendarItem } from '@/features/posts/props/content-calendar-page.props';
import { RELEASE_RESCHEDULE_ACTION } from '@/features/posts/release/release-actions';
import { CALENDAR_REPUBLISH_ACTION } from '@/features/posts/shared/calendar-republish-dialog';
import { useCalendarReleaseActions } from './use-calendar-release-actions';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const FUTURE = '2099-01-01T10:00:00.000Z';
const MOVED = '2099-01-02T10:00:00.000Z';
const PAST = '2020-01-01T10:00:00.000Z';

function buildRelease(id: string, scheduledAt: string): IReleaseGroup {
  return {
    id,
    scheduledAt,
    status: ReleaseStatus.SCHEDULED,
    targets: [],
    title: id,
  } as unknown as IReleaseGroup;
}

interface Deferred<T> {
  promise: Promise<T>;
  reject: (error: Error) => void;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

function setup(initial: IReleaseGroup[]) {
  const service = {
    moveCalendarPlacement: vi.fn(),
    republishAt: vi.fn(),
    update: vi.fn(),
  };
  const notificationsService = { error: vi.fn(), success: vi.fn() };

  const hook = renderHook(() => {
    const [releases, setReleases] = useState(initial);
    const actions = useCalendarReleaseActions({
      getPostsService: vi.fn(),
      getReleaseGroupsService: async () =>
        service as unknown as ReleaseGroupsService,
      href: (path) => path,
      notificationsService:
        notificationsService as unknown as NotificationsService,
      openPostRepurposeModal: vi.fn(),
      push: vi.fn(),
      releases,
      setReleases,
    });
    return { ...actions, releases };
  });

  return { hook, notificationsService, service };
}

function dropOf(release: IReleaseGroup, start: string) {
  const revert = vi.fn();
  return {
    change: {
      item: {
        itemType: 'release',
        release,
      } as unknown as ContentCalendarItem,
      revert,
      start: new Date(start),
    },
    revert,
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
}

describe('useCalendarReleaseActions pending tracking', () => {
  it('keeps release A pending when release B starts and finishes, and vice versa', async () => {
    const a = buildRelease('a', FUTURE);
    const b = buildRelease('b', FUTURE);
    const { hook, service } = setup([a, b]);
    const aRequest = deferred<IReleaseGroup>();
    const bRequest = deferred<IReleaseGroup>();
    service.update.mockImplementation((id: string) =>
      id === 'a' ? aRequest.promise : bRequest.promise,
    );

    act(() => hook.result.current.setSelectedReleaseId('a'));
    act(() => hook.result.current.handleRescheduleRelease(MOVED));
    await flush();
    expect(hook.result.current.pendingAction).toBe(RELEASE_RESCHEDULE_ACTION);

    act(() => hook.result.current.setSelectedReleaseId('b'));
    expect(hook.result.current.pendingAction).toBeNull();
    act(() => hook.result.current.handleRescheduleRelease(MOVED));
    await flush();
    expect(hook.result.current.pendingAction).toBe(RELEASE_RESCHEDULE_ACTION);

    await act(async () => bRequest.resolve({ ...b, scheduledAt: MOVED }));
    await flush();
    expect(hook.result.current.pendingAction).toBeNull();

    act(() => hook.result.current.setSelectedReleaseId('a'));
    expect(hook.result.current.pendingAction).toBe(RELEASE_RESCHEDULE_ACTION);

    await act(async () => aRequest.resolve({ ...a, scheduledAt: MOVED }));
    await flush();
    expect(hook.result.current.pendingAction).toBeNull();
  });

  it('does not clear B when A finishes first', async () => {
    const a = buildRelease('a', FUTURE);
    const b = buildRelease('b', FUTURE);
    const { hook, service } = setup([a, b]);
    const aRequest = deferred<IReleaseGroup>();
    const bRequest = deferred<IReleaseGroup>();
    service.update.mockImplementation((id: string) =>
      id === 'a' ? aRequest.promise : bRequest.promise,
    );

    act(() => hook.result.current.setSelectedReleaseId('a'));
    act(() => hook.result.current.handleRescheduleRelease(MOVED));
    act(() => hook.result.current.setSelectedReleaseId('b'));
    act(() => hook.result.current.handleRescheduleRelease(MOVED));
    await flush();

    await act(async () => aRequest.resolve({ ...a, scheduledAt: MOVED }));
    await flush();
    expect(hook.result.current.pendingAction).toBe(RELEASE_RESCHEDULE_ACTION);

    await act(async () => bRequest.resolve({ ...b, scheduledAt: MOVED }));
    await flush();
    expect(hook.result.current.pendingAction).toBeNull();
  });
});

describe('useCalendarReleaseActions duplicate drops', () => {
  it('sends one republish request for two immediate republish drops', async () => {
    const release = buildRelease('a', PAST);
    const { hook, service } = setup([release]);
    const request = deferred<IReleaseGroup>();
    service.republishAt.mockReturnValue(request.promise);

    act(() =>
      hook.result.current.handleEventDrop(dropOf(release, MOVED).change),
    );
    expect(hook.result.current.pendingDrop?.release.id).toBe('a');

    act(() => {
      hook.result.current.handleRepublishDrop();
      hook.result.current.handleRepublishDrop();
    });
    await flush();

    expect(service.republishAt.mock.calls).toHaveLength(1);
    expect(hook.result.current.pendingDropAction).toBe(
      CALENDAR_REPUBLISH_ACTION,
    );

    await act(async () => request.resolve({ ...release, scheduledAt: MOVED }));
    await flush();
    expect(hook.result.current.pendingDropAction).toBeNull();
  });
});

describe('useCalendarReleaseActions rollback', () => {
  it("rolls back only the failed release and keeps another release's optimistic move", async () => {
    const a = buildRelease('a', FUTURE);
    const b = buildRelease('b', FUTURE);
    const { hook, service } = setup([a, b]);
    const aRequest = deferred<IReleaseGroup>();
    const bRequest = deferred<IReleaseGroup>();
    service.update.mockImplementation((id: string) =>
      id === 'a' ? aRequest.promise : bRequest.promise,
    );
    const dropA = dropOf(a, MOVED);
    const dropB = dropOf(b, MOVED);

    // Both drops land before React re-renders, as two quick drags can.
    act(() => {
      hook.result.current.handleEventDrop(dropB.change);
      hook.result.current.handleEventDrop(dropA.change);
    });
    await flush();
    expect(hook.result.current.releases.map((r) => r.scheduledAt)).toEqual([
      MOVED,
      MOVED,
    ]);

    await act(async () => bRequest.reject(new Error('boom')));
    await flush();

    expect(dropB.revert).toHaveBeenCalledTimes(1);
    expect(dropA.revert).not.toHaveBeenCalled();
    expect(hook.result.current.releases.map((r) => r.scheduledAt)).toEqual([
      MOVED,
      FUTURE,
    ]);
  });
});
