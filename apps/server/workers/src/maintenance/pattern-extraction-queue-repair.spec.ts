import { PATTERN_EXTRACTION_QUEUE } from '@genfeedai/queue-contracts';
import {
  parsePatternExtractionRepairArgs,
  repairPatternExtractionQueue,
} from '@workers/maintenance/pattern-extraction-queue-repair';
import type { Job } from 'bullmq';

describe('pattern extraction queue repair', () => {
  it('defaults to a dry run and rejects ambiguous arguments', () => {
    expect(parsePatternExtractionRepairArgs([])).toEqual({ dryRun: true });
    expect(parsePatternExtractionRepairArgs(['--live'])).toEqual({
      dryRun: false,
    });
    expect(() =>
      parsePatternExtractionRepairArgs(['--dry-run', '--live']),
    ).toThrow('Choose either --dry-run or --live, not both.');
    expect(() => parsePatternExtractionRepairArgs(['--all'])).toThrow(
      'Unknown argument: --all',
    );
  });

  it('reports exact matches without mutating queues in dry-run mode', async () => {
    const strandedJob = job(PATTERN_EXTRACTION_QUEUE);
    const unrelatedJob = job('unrelated-job');
    const defaultQueue = {
      getWaiting: vi.fn().mockResolvedValue([strandedJob, unrelatedJob]),
    };
    const producer = { enqueueScan: vi.fn() };

    const report = await repairPatternExtractionQueue(defaultQueue, producer, {
      dryRun: true,
    });

    expect(defaultQueue.getWaiting).toHaveBeenCalledWith(0, -1);
    expect(strandedJob.remove).not.toHaveBeenCalled();
    expect(unrelatedJob.remove).not.toHaveBeenCalled();
    expect(producer.enqueueScan).not.toHaveBeenCalled();
    expect(report).toEqual({
      dryRun: true,
      enqueued: false,
      matched: 1,
      removed: 0,
    });
  });

  it('removes only exact matches and enqueues one fresh scan in live mode', async () => {
    const operations: string[] = [];
    const strandedJob = {
      name: PATTERN_EXTRACTION_QUEUE,
      remove: vi.fn().mockImplementation(async () => {
        operations.push('remove');
      }),
    } as unknown as Job;
    const unrelatedJob = job('unrelated-job');
    const defaultQueue = {
      getWaiting: vi.fn().mockResolvedValue([strandedJob, unrelatedJob]),
    };
    const producer = {
      enqueueScan: vi.fn().mockImplementation(async () => {
        operations.push('enqueue');
      }),
    };

    const report = await repairPatternExtractionQueue(defaultQueue, producer, {
      dryRun: false,
    });

    expect(strandedJob.remove).toHaveBeenCalledTimes(1);
    expect(unrelatedJob.remove).not.toHaveBeenCalled();
    expect(producer.enqueueScan).toHaveBeenCalledTimes(1);
    expect(operations).toEqual(['enqueue', 'remove']);
    expect(report).toEqual({
      dryRun: false,
      enqueued: true,
      matched: 1,
      removed: 1,
    });
  });

  it('keeps stranded jobs when the replacement scan cannot be enqueued', async () => {
    const strandedJob = job(PATTERN_EXTRACTION_QUEUE);
    const defaultQueue = {
      getWaiting: vi.fn().mockResolvedValue([strandedJob]),
    };
    const producer = {
      enqueueScan: vi.fn().mockRejectedValue(new Error('enqueue failed')),
    };

    await expect(
      repairPatternExtractionQueue(defaultQueue, producer, { dryRun: false }),
    ).rejects.toThrow('enqueue failed');

    expect(strandedJob.remove).not.toHaveBeenCalled();
  });

  it('does not enqueue a scan when no stranded jobs were found', async () => {
    const defaultQueue = { getWaiting: vi.fn().mockResolvedValue([]) };
    const producer = { enqueueScan: vi.fn() };

    const report = await repairPatternExtractionQueue(defaultQueue, producer, {
      dryRun: false,
    });

    expect(producer.enqueueScan).not.toHaveBeenCalled();
    expect(report.enqueued).toBe(false);
  });
});

function job(name: string): Job {
  return {
    name,
    remove: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job;
}
