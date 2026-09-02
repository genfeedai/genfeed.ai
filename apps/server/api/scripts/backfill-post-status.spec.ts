import { PostStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  mapInvalidPostStatus,
  type PostStatusBackfillClient,
  type PostStatusFindManyArgs,
  type PostStatusRow,
  type PostStatusUpdateManyArgs,
  parseArgs,
  runPostStatusBackfill,
} from './backfill-post-status';

class FakePostStatusBackfillClient implements PostStatusBackfillClient {
  private beforeFirstUpdateRan = false;
  readonly updateCalls: PostStatusUpdateManyArgs[] = [];
  readonly post = {
    findMany: async (args: PostStatusFindManyArgs) => this.findMany(args),
    updateMany: async (args: PostStatusUpdateManyArgs) => this.updateMany(args),
  };

  constructor(
    private readonly rows: PostStatusRow[],
    private readonly beforeFirstUpdate?: (rows: PostStatusRow[]) => void,
  ) {}

  private async findMany(
    args: PostStatusFindManyArgs,
  ): Promise<readonly PostStatusRow[]> {
    return this.rows
      .filter(
        (row) =>
          !args.where.status.notIn.includes(row.status) &&
          (!args.where.id || row.id > args.where.id.gt),
      )
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, args.take)
      .map((row) => ({ ...row }));
  }

  private async updateMany(
    args: PostStatusUpdateManyArgs,
  ): Promise<{ count: number }> {
    if (!this.beforeFirstUpdateRan) {
      this.beforeFirstUpdateRan = true;
      this.beforeFirstUpdate?.(this.rows);
    }
    this.updateCalls.push(args);
    let count = 0;
    for (const row of this.rows) {
      if (
        args.where.id.in.includes(row.id) &&
        row.status === args.where.status
      ) {
        row.status = args.data.status;
        count += 1;
      }
    }
    return { count };
  }
}

const invalidRows = (): PostStatusRow[] => [
  { id: '01', status: 'paused' },
  { id: '02', status: 'cancelled' },
  { id: '03', status: 'publishing' },
  { id: '04', status: 'partially-published' },
  { id: '05', status: 'unknown-from-old-release' },
  { id: '06', status: PostStatus.PENDING },
];

describe('backfill-post-status', () => {
  it('defaults to a dry run and validates the bounded batch size', () => {
    expect(parseArgs([])).toEqual({ batchSize: 500, dryRun: true });
    expect(parseArgs(['--dry-run', '--batch=25'])).toEqual({
      batchSize: 25,
      dryRun: true,
    });
    expect(parseArgs(['--live', '--batch=5000'])).toEqual({
      batchSize: 5_000,
      dryRun: false,
    });
    expect(() => parseArgs(['--live', '--dry-run'])).toThrow(
      'Choose either --dry-run or --live',
    );
    expect(() => parseArgs(['--batch=0'])).toThrow('positive integer');
    expect(() => parseArgs(['--batch=5001'])).toThrow('at most 5000');
    expect(() => parseArgs(['--unknown'])).toThrow('Unknown argument');
  });

  it('uses the accepted mapper for known, aggregate, and unknown values', () => {
    expect(mapInvalidPostStatus('paused')).toBe(PostStatus.DRAFT);
    expect(mapInvalidPostStatus('cancelled')).toBe(PostStatus.DRAFT);
    expect(mapInvalidPostStatus('publishing')).toBe(PostStatus.PROCESSING);
    expect(mapInvalidPostStatus('published')).toBe(PostStatus.PUBLIC);
    expect(mapInvalidPostStatus('partially-published')).toBe(
      PostStatus.SCHEDULED,
    );
    expect(mapInvalidPostStatus('unknown-from-old-release')).toBe(
      PostStatus.SCHEDULED,
    );
  });

  it('inventories invalid rows without writing in the default dry run', async () => {
    const client = new FakePostStatusBackfillClient(invalidRows());

    const report = await runPostStatusBackfill(client, {
      batchSize: 2,
      dryRun: true,
    });

    expect(report).toMatchObject({
      concurrentChangesSkipped: 0,
      dryRun: true,
      remainingInvalid: 5,
      scanned: 5,
      updated: 0,
      wouldUpdate: 5,
    });
    expect(report.before).toEqual(report.after);
    expect(report.before).toEqual([
      {
        count: 1,
        sourceStatus: 'cancelled',
        targetStatus: PostStatus.DRAFT,
      },
      {
        count: 1,
        sourceStatus: 'partially-published',
        targetStatus: PostStatus.SCHEDULED,
      },
      {
        count: 1,
        sourceStatus: 'paused',
        targetStatus: PostStatus.DRAFT,
      },
      {
        count: 1,
        sourceStatus: 'publishing',
        targetStatus: PostStatus.PROCESSING,
      },
      {
        count: 1,
        sourceStatus: 'unknown-from-old-release',
        targetStatus: PostStatus.SCHEDULED,
      },
    ]);
    expect(client.updateCalls).toHaveLength(0);
  });

  it('updates only status with source-value guards and is idempotent', async () => {
    const client = new FakePostStatusBackfillClient(invalidRows());

    const first = await runPostStatusBackfill(client, {
      batchSize: 2,
      dryRun: false,
    });
    const second = await runPostStatusBackfill(client, {
      batchSize: 2,
      dryRun: false,
    });

    expect(first).toMatchObject({
      concurrentChangesSkipped: 0,
      dryRun: false,
      remainingInvalid: 0,
      scanned: 5,
      updated: 5,
      wouldUpdate: 5,
    });
    expect(first.after).toEqual([]);
    expect(second).toMatchObject({
      remainingInvalid: 0,
      scanned: 0,
      updated: 0,
      wouldUpdate: 0,
    });
    expect(
      client.updateCalls.every(
        (call) => Object.keys(call.data).length === 1 && 'status' in call.data,
      ),
    ).toBe(true);
    expect(
      client.updateCalls.every((call) => typeof call.where.status === 'string'),
    ).toBe(true);
  });

  it('reports a concurrent status change instead of overwriting it', async () => {
    const client = new FakePostStatusBackfillClient(
      [{ id: '01', status: 'paused' }],
      (rows) => {
        const row = rows[0];
        if (row) {
          row.status = PostStatus.DRAFT;
        }
      },
    );

    const report = await runPostStatusBackfill(client, {
      batchSize: 10,
      dryRun: false,
    });

    expect(report).toMatchObject({
      concurrentChangesSkipped: 1,
      remainingInvalid: 0,
      scanned: 1,
      updated: 0,
      wouldUpdate: 1,
    });
    expect(client.updateCalls).toEqual([
      {
        data: { status: PostStatus.DRAFT },
        where: { id: { in: ['01'] }, status: 'paused' },
      },
    ]);
  });
});
