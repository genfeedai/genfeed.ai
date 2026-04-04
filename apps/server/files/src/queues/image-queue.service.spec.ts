import { ImageQueueService } from '@files/queues/image-queue.service';
import { QUEUE_NAMES } from '@files/queues/queue.constants';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';

describe('ImageQueueService', () => {
  let service: ImageQueueService;

  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    getJob: vi.fn(),
    getJobs: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageQueueService,
        {
          provide: getQueueToken(QUEUE_NAMES.IMAGE_PROCESSING),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<ImageQueueService>(ImageQueueService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
