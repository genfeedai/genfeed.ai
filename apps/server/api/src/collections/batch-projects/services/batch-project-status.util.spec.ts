import {
  countBatchProjectItems,
  deriveBatchProjectStatus,
} from '@api/collections/batch-projects/services/batch-project-status.util';
import {
  BatchProjectItemStatus,
  BatchProjectStatus,
} from '@genfeedai/contracts';

const item = (
  status: BatchProjectItemStatus,
  scheduledAt: string | null = null,
) => ({ scheduledAt, status });

describe('batch project status', () => {
  it('counts items by state, including scheduled approvals', () => {
    expect(
      countBatchProjectItems([
        item(BatchProjectItemStatus.READY),
        item(BatchProjectItemStatus.APPROVED, '2026-09-28T10:00:00Z'),
        item(BatchProjectItemStatus.FAILED),
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
    [[], BatchProjectStatus.DRAFT],
    [[item(BatchProjectItemStatus.PENDING)], BatchProjectStatus.DRAFT],
    [
      [
        item(BatchProjectItemStatus.GENERATING),
        item(BatchProjectItemStatus.READY),
      ],
      BatchProjectStatus.GENERATING,
    ],
    [
      [item(BatchProjectItemStatus.READY), item(BatchProjectItemStatus.FAILED)],
      BatchProjectStatus.REVIEWING,
    ],
    [[item(BatchProjectItemStatus.APPROVED)], BatchProjectStatus.REVIEWING],
    [
      [
        item(BatchProjectItemStatus.APPROVED, '2026-09-28T10:00:00Z'),
        item(BatchProjectItemStatus.FAILED),
      ],
      BatchProjectStatus.PARTIAL_FAILURE,
    ],
    [
      [
        item(BatchProjectItemStatus.APPROVED, '2026-09-28T10:00:00Z'),
        item(BatchProjectItemStatus.REJECTED),
      ],
      BatchProjectStatus.SCHEDULED,
    ],
    [[item(BatchProjectItemStatus.REJECTED)], BatchProjectStatus.COMPLETED],
  ])('derives the project state from its items (%#)', (items, expected) => {
    expect(deriveBatchProjectStatus(items, BatchProjectStatus.DRAFT)).toBe(
      expected,
    );
  });

  it('keeps a cancelled project cancelled unless generation restarts', () => {
    expect(
      deriveBatchProjectStatus(
        [item(BatchProjectItemStatus.READY)],
        BatchProjectStatus.CANCELLED,
      ),
    ).toBe(BatchProjectStatus.CANCELLED);
    expect(
      deriveBatchProjectStatus(
        [item(BatchProjectItemStatus.GENERATING)],
        BatchProjectStatus.CANCELLED,
      ),
    ).toBe(BatchProjectStatus.GENERATING);
  });
});
