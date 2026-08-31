import { FileQueueService } from '@files/queues/file-queue.service';
import { FILE_QUEUE_NAMES as QUEUE_NAMES } from '@genfeedai/queue-contracts';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';

describe('FileQueueService', () => {
  let service: FileQueueService;

  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    getJob: vi.fn(),
    getJobs: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileQueueService,
        {
          provide: getQueueToken(QUEUE_NAMES.FILE_PROCESSING),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<FileQueueService>(FileQueueService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
