import {
  countTurboProjectItems,
  deriveTurboProjectStatus,
} from '@api/collections/turbo-projects/services/turbo-project-status.util';
import {
  TurboProjectItemStatus,
  TurboProjectStatus,
} from '@genfeedai/contracts';

const item = (
  status: TurboProjectItemStatus,
  scheduledAt: string | null = null,
) => ({ scheduledAt, status });

describe('Turbo project status', () => {
  it('counts items by state, including scheduled approvals', () => {
    expect(
      countTurboProjectItems([
        item(TurboProjectItemStatus.READY),
        item(TurboProjectItemStatus.APPROVED, '2026-09-28T10:00:00Z'),
        item(TurboProjectItemStatus.FAILED),
      ]),
    ).toMatchObject({
      approved: 1,
      failed: 1,
      ready: 1,
      scheduled: 1,
      total: 3,
    });
  });

  it.each([
    [[], TurboProjectStatus.DRAFT],
    [[item(TurboProjectItemStatus.PENDING)], TurboProjectStatus.DRAFT],
    [
      [
        item(TurboProjectItemStatus.GENERATING),
        item(TurboProjectItemStatus.READY),
      ],
      TurboProjectStatus.GENERATING,
    ],
    [
      [item(TurboProjectItemStatus.READY), item(TurboProjectItemStatus.FAILED)],
      TurboProjectStatus.REVIEWING,
    ],
    [[item(TurboProjectItemStatus.APPROVED)], TurboProjectStatus.REVIEWING],
    [
      [
        item(TurboProjectItemStatus.APPROVED, '2026-09-28T10:00:00Z'),
        item(TurboProjectItemStatus.FAILED),
      ],
      TurboProjectStatus.PARTIAL_FAILURE,
    ],
    [
      [
        item(TurboProjectItemStatus.APPROVED, '2026-09-28T10:00:00Z'),
        item(TurboProjectItemStatus.REJECTED),
      ],
      TurboProjectStatus.SCHEDULED,
    ],
    [[item(TurboProjectItemStatus.REJECTED)], TurboProjectStatus.COMPLETED],
  ])('derives the project state from its items (%#)', (items, expected) => {
    expect(deriveTurboProjectStatus(items, TurboProjectStatus.DRAFT)).toBe(
      expected,
    );
  });

  it('keeps a cancelled project cancelled unless generation restarts', () => {
    expect(
      deriveTurboProjectStatus(
        [item(TurboProjectItemStatus.READY)],
        TurboProjectStatus.CANCELLED,
      ),
    ).toBe(TurboProjectStatus.CANCELLED);
    expect(
      deriveTurboProjectStatus(
        [item(TurboProjectItemStatus.GENERATING)],
        TurboProjectStatus.CANCELLED,
      ),
    ).toBe(TurboProjectStatus.GENERATING);
  });
});
