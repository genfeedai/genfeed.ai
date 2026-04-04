import {
  BATCH_WORKFLOW_QUEUE,
  BatchWorkflowItemJobData,
  BatchWorkflowQueueService,
} from '@api/collections/workflows/services/batch-workflow-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';

describe('BatchWorkflowQueueService', () => {
  let service: BatchWorkflowQueueService;
  let mockQueue: {
    addBulk: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  const makeItem = (
    overrides: Partial<BatchWorkflowItemJobData> = {},
  ): BatchWorkflowItemJobData => ({
    batchJobId: 'batch-001',
    ingredientId: 'ing-001',
    itemId: 'item-001',
    organizationId: 'org-001',
    userId: 'user-001',
    workflowId: 'wf-001',
    ...overrides,
  });

  beforeEach(async () => {
    mockQueue = { addBulk: vi.fn().mockResolvedValue([]) };
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchWorkflowQueueService,
        {
          provide: getQueueToken(BATCH_WORKFLOW_QUEUE),
          useValue: mockQueue,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<BatchWorkflowQueueService>(BatchWorkflowQueueService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enqueueBatchItems', () => {
    it('should call addBulk with correctly shaped jobs', async () => {
      const items = [
        makeItem({ itemId: 'item-1' }),
        makeItem({ itemId: 'item-2' }),
      ];

      await service.enqueueBatchItems(items);

      expect(mockQueue.addBulk).toHaveBeenCalledTimes(1);
      const [jobs] = mockQueue.addBulk.mock.calls[0] as Parameters<
        typeof mockQueue.addBulk
      >;
      expect(jobs).toHaveLength(2);
    });

    it('should set name to process-batch-item for each job', async () => {
      const items = [makeItem()];

      await service.enqueueBatchItems(items);

      const [jobs] = mockQueue.addBulk.mock.calls[0] as Parameters<
        typeof mockQueue.addBulk
      >;
      expect(jobs[0].name).toBe('process-batch-item');
    });

    it('should generate jobId as batch-<batchJobId>-<itemId>', async () => {
      const items = [makeItem({ batchJobId: 'b1', itemId: 'i1' })];

      await service.enqueueBatchItems(items);

      const [jobs] = mockQueue.addBulk.mock.calls[0] as Parameters<
        typeof mockQueue.addBulk
      >;
      expect(jobs[0].opts?.jobId).toBe('batch-b1-i1');
    });

    it('should set attempts to 2 and backoff to exponential', async () => {
      const items = [makeItem()];

      await service.enqueueBatchItems(items);

      const [jobs] = mockQueue.addBulk.mock.calls[0] as Parameters<
        typeof mockQueue.addBulk
      >;
      expect(jobs[0].opts?.attempts).toBe(2);
      expect(jobs[0].opts?.backoff).toEqual({
        delay: 5000,
        type: 'exponential',
      });
    });

    it('should log the enqueue with item count and batchJobId', async () => {
      const items = [
        makeItem({ batchJobId: 'batch-42' }),
        makeItem({ batchJobId: 'batch-42', itemId: 'item-2' }),
      ];

      await service.enqueueBatchItems(items);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('enqueued 2 batch items'),
        expect.objectContaining({ batchJobId: 'batch-42', itemCount: 2 }),
      );
    });

    it('should enqueue a single item without error', async () => {
      const items = [makeItem()];

      await expect(service.enqueueBatchItems(items)).resolves.toBeUndefined();
      expect(mockQueue.addBulk).toHaveBeenCalledTimes(1);
    });

    it('should propagate addBulk errors', async () => {
      mockQueue.addBulk.mockRejectedValue(new Error('Queue unavailable'));
      const items = [makeItem()];

      await expect(service.enqueueBatchItems(items)).rejects.toThrow(
        'Queue unavailable',
      );
    });

    it('should pass all data fields through to the job', async () => {
      const item = makeItem({
        batchJobId: 'bj-99',
        ingredientId: 'ing-99',
        itemId: 'it-99',
        organizationId: 'org-99',
        userId: 'usr-99',
        workflowId: 'wf-99',
      });

      await service.enqueueBatchItems([item]);

      const [jobs] = mockQueue.addBulk.mock.calls[0] as Parameters<
        typeof mockQueue.addBulk
      >;
      expect(jobs[0].data).toEqual(item);
    });
  });
});
