import { QUEUE_NAMES } from '@files/queues/queue.constants';
import { VideoQueueService } from '@files/queues/video-queue.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';

describe('VideoQueueService', () => {
  let service: VideoQueueService;

  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    getJob: vi.fn(),
    getJobs: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoQueueService,
        {
          provide: getQueueToken(QUEUE_NAMES.VIDEO_PROCESSING),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<VideoQueueService>(VideoQueueService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
