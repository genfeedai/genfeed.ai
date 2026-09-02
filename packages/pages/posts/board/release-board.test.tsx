import {
  CredentialPlatform,
  PostVisibility,
  ReleaseStatus,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/contracts';
import type {
  IChannelTarget,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReleaseBoard from './release-board';
import '@testing-library/jest-dom/vitest';

const { notifyErrorMock } = vi.hoisted(() => ({
  notifyErrorMock: vi.fn(),
}));

const updateReleaseMock = vi.fn();
const cancelReleaseMock = vi.fn();
const moveCalendarPlacementMock = vi.fn();
const republishAtMock = vi.fn();
const findNextSlotMock = vi.fn();
const useAuthedServiceMock = vi.fn();
let useAuthedServiceCallCount = 0;

const getReleaseGroupsServiceMock = vi.fn(async () => ({
  cancel: cancelReleaseMock,
  moveCalendarPlacement: moveCalendarPlacementMock,
  republishAt: republishAtMock,
  update: updateReleaseMock,
}));
const getCredentialsServiceMock = vi.fn(async () => ({
  findNextSlot: findNextSlotMock,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => path }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (...args: unknown[]) => useAuthedServiceMock(...args),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: notifyErrorMock,
      success: vi.fn(),
    })),
  },
}));

function buildTarget(overrides: Partial<IChannelTarget> = {}): IChannelTarget {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    credentialId: 'credential-1',
    executionState: TargetExecutionState.SCHEDULED,
    id: 'target-1',
    isDeleted: false,
    platform: CredentialPlatform.INSTAGRAM,
    releaseId: 'release-1',
    settings: {},
    timezone: 'UTC',
    updatedAt: '2026-01-01T00:00:00.000Z',
    validationIssues: [],
    validationState: TargetValidationState.VALID,
    visibility: PostVisibility.PUBLIC,
    ...overrides,
  } as IChannelTarget;
}

function buildRelease(overrides: Partial<IReleaseGroup> = {}): IReleaseGroup {
  return {
    baseContent: 'First line of copy',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'release-1',
    isDeleted: false,
    media: [],
    organizationId: 'org-1',
    ownerId: 'user-1',
    scheduledAt: '2026-12-12T10:00:00.000Z',
    status: ReleaseStatus.SCHEDULED,
    targets: [buildTarget()],
    timezone: 'UTC',
    title: 'Launch post',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as IReleaseGroup;
}

function renderBoard(releases: IReleaseGroup[]) {
  return render(
    <ReleaseBoard
      browserTimezone="UTC"
      isLoading={false}
      loadError={false}
      onRefetch={vi.fn()}
      releases={releases}
    />,
  );
}

function drop(releaseId: string, columnLabel: string) {
  const card = screen.getByText('Launch post').closest('[draggable]');
  if (!card) {
    throw new Error(`Draggable card for ${releaseId} not found`);
  }

  const dataTransfer = {
    data: {} as Record<string, string>,
    setData(format: string, value: string) {
      this.data[format] = value;
    },
  };

  fireEvent.dragStart(card, { dataTransfer });

  const column = screen.getByText(columnLabel).closest('div')?.parentElement;
  if (!column) {
    throw new Error(`Column "${columnLabel}" not found`);
  }

  fireEvent.dragOver(column, { dataTransfer });
  fireEvent.drop(column, { dataTransfer });
}

describe('ReleaseBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthedServiceCallCount = 0;
    // The board resolves two services per render, in declaration order:
    // release groups, then credentials.
    const servicesInCallOrder = [
      getReleaseGroupsServiceMock,
      getCredentialsServiceMock,
    ];
    useAuthedServiceMock.mockImplementation(() => {
      const service =
        servicesInCallOrder[
          useAuthedServiceCallCount % servicesInCallOrder.length
        ];
      useAuthedServiceCallCount += 1;
      return service;
    });
  });

  it('schedules a draggable release when dropped on the Scheduled column', async () => {
    updateReleaseMock.mockResolvedValue(
      buildRelease({ scheduledAt: '2026-12-13T10:00:00.000Z' }),
    );
    renderBoard([buildRelease({ status: ReleaseStatus.DRAFT })]);

    drop('release-1', 'Scheduled');

    await waitFor(() => {
      expect(updateReleaseMock).toHaveBeenCalledWith('release-1', {
        scheduledDate: '2026-12-12T10:00:00.000Z',
      });
    });
    expect(moveCalendarPlacementMock).not.toHaveBeenCalled();
    expect(republishAtMock).not.toHaveBeenCalled();
  });

  it('opens the republish dialog instead of scheduling directly when the release is already live', async () => {
    updateReleaseMock.mockResolvedValue(buildRelease());
    renderBoard([
      buildRelease({
        status: ReleaseStatus.PUBLISHED,
        targets: [
          buildTarget({ executionState: TargetExecutionState.PUBLISHED }),
        ],
      }),
    ]);

    drop('release-1', 'Scheduled');

    expect(
      screen.getByRole('heading', { name: 'Move the card or publish again?' }),
    ).toBeInTheDocument();
    expect(updateReleaseMock).not.toHaveBeenCalled();

    moveCalendarPlacementMock.mockResolvedValue(
      buildRelease({ status: ReleaseStatus.PUBLISHED }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move card only' }));

    await waitFor(() => {
      expect(moveCalendarPlacementMock).toHaveBeenCalledWith(
        'release-1',
        '2026-12-12T10:00:00.000Z',
      );
    });
    expect(republishAtMock).not.toHaveBeenCalled();
  });

  it('resolves the republish dialog through "Publish again" when chosen', async () => {
    republishAtMock.mockResolvedValue(
      buildRelease({ id: 'release-2', status: ReleaseStatus.SCHEDULED }),
    );
    renderBoard([
      buildRelease({
        status: ReleaseStatus.PUBLISHED,
        targets: [
          buildTarget({ executionState: TargetExecutionState.PUBLISHED }),
        ],
      }),
    ]);

    drop('release-1', 'Scheduled');
    fireEvent.click(screen.getByRole('button', { name: 'Publish again' }));

    await waitFor(() => {
      expect(republishAtMock).toHaveBeenCalledWith(
        'release-1',
        '2026-12-12T10:00:00.000Z',
      );
    });
    expect(moveCalendarPlacementMock).not.toHaveBeenCalled();
  });

  it.each(['Published', 'Failed', 'Awaiting review', 'Draft'])(
    'never calls the release groups service when a card is dropped on %s',
    async (columnLabel) => {
      // Source status is always Scheduled so the drop always crosses into a
      // different column, exercising the refusal branch rather than the
      // same-column no-op early return.
      renderBoard([buildRelease({ status: ReleaseStatus.SCHEDULED })]);

      drop('release-1', columnLabel);

      await waitFor(() => {
        expect(notifyErrorMock).toHaveBeenCalledWith(
          "That column can't be changed by dragging a card",
        );
      });
      expect(updateReleaseMock).not.toHaveBeenCalled();
      expect(moveCalendarPlacementMock).not.toHaveBeenCalled();
      expect(republishAtMock).not.toHaveBeenCalled();
      expect(cancelReleaseMock).not.toHaveBeenCalled();
    },
  );

  it('issues exactly one findNextSlot and one update call per selected release for bulk scheduling', async () => {
    findNextSlotMock
      .mockResolvedValueOnce({
        found: true,
        instant: '2026-12-14T09:00:00.000Z',
      })
      .mockResolvedValueOnce({
        found: true,
        instant: '2026-12-14T18:00:00.000Z',
      });
    updateReleaseMock
      .mockResolvedValueOnce(
        buildRelease({ scheduledAt: '2026-12-14T09:00:00.000Z' }),
      )
      .mockResolvedValueOnce(
        buildRelease({
          id: 'release-2',
          scheduledAt: '2026-12-14T18:00:00.000Z',
        }),
      );

    renderBoard([
      buildRelease({
        id: 'release-1',
        status: ReleaseStatus.DRAFT,
        targets: [buildTarget({ credentialId: 'credential-1' })],
        title: 'First release',
      }),
      buildRelease({
        id: 'release-2',
        status: ReleaseStatus.DRAFT,
        targets: [buildTarget({ credentialId: 'credential-2' })],
        title: 'Second release',
      }),
    ]);

    const checkboxes = screen.getAllByRole('checkbox');
    act(() => {
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Schedule at next slot' }),
    );

    await waitFor(() => {
      expect(updateReleaseMock).toHaveBeenCalledTimes(2);
    });
    expect(findNextSlotMock).toHaveBeenCalledTimes(2);
    expect(findNextSlotMock).toHaveBeenCalledWith('credential-1');
    expect(findNextSlotMock).toHaveBeenCalledWith('credential-2');
    expect(updateReleaseMock).toHaveBeenNthCalledWith(1, 'release-1', {
      scheduledDate: '2026-12-14T09:00:00.000Z',
    });
    expect(updateReleaseMock).toHaveBeenNthCalledWith(2, 'release-2', {
      scheduledDate: '2026-12-14T18:00:00.000Z',
    });
  });

  it('cancels every selected release for the bulk delete action, never a true delete call', async () => {
    cancelReleaseMock
      .mockResolvedValueOnce(
        buildRelease({ id: 'release-1', status: ReleaseStatus.CANCELLED }),
      )
      .mockResolvedValueOnce(
        buildRelease({ id: 'release-2', status: ReleaseStatus.CANCELLED }),
      );

    renderBoard([
      buildRelease({ id: 'release-1', title: 'First release' }),
      buildRelease({ id: 'release-2', title: 'Second release' }),
    ]);

    const checkboxes = screen.getAllByRole('checkbox');
    act(() => {
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(cancelReleaseMock).toHaveBeenCalledTimes(2);
    });
    expect(cancelReleaseMock).toHaveBeenCalledWith('release-1');
    expect(cancelReleaseMock).toHaveBeenCalledWith('release-2');
  });
});
