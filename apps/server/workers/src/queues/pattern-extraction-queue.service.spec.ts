import {
  PATTERN_EXTRACTION_QUEUE,
  type PatternExtractionJobData,
} from '@genfeedai/queue-contracts';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { PatternExtractionQueueService } from '@workers/queues/pattern-extraction-queue.service';
import type { Queue } from 'bullmq';

describe('PatternExtractionQueueService', () => {
  let service: PatternExtractionQueueService;
  let patternExtractionQueue: Pick<Queue<PatternExtractionJobData>, 'add'>;

  beforeEach(async () => {
    patternExtractionQueue = {
      add: vi.fn().mockResolvedValue({ id: 'pattern-extraction-job' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatternExtractionQueueService,
        {
          provide: getQueueToken(PATTERN_EXTRACTION_QUEUE),
          useValue: patternExtractionQueue,
        },
      ],
    }).compile();

    service = module.get(PatternExtractionQueueService);
  });

  it('enqueues the scan on the pattern extraction queue', async () => {
    await service.enqueueScan();

    expect(patternExtractionQueue.add).toHaveBeenCalledWith(
      PATTERN_EXTRACTION_QUEUE,
      {},
      expect.objectContaining({
        attempts: 2,
        backoff: { delay: 10000, type: 'exponential' },
      }),
    );
  });

  it('uses one deterministic job id per UTC day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T02:00:00.000Z'));

    try {
      await service.enqueueScan();

      expect(patternExtractionQueue.add).toHaveBeenCalledWith(
        PATTERN_EXTRACTION_QUEUE,
        {},
        expect.objectContaining({
          jobId: 'pattern-extraction-2026-08-15',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
