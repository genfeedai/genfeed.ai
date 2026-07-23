import { JOB_TYPES, QUEUE_NAMES } from '@files/queues/queue.constants';
import { VideoQueueService } from '@files/queues/video-queue.service';
import type { VideoJobData } from '@files/shared/interfaces/job.interface';
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

  it('uses the request id for deterministic caption jobs', async () => {
    const data = {
      createdAt: new Date(),
      id: 'raw-cut-caption-clip-1',
      ingredientId: 'clip-1',
      metadata: { websocketUrl: '/clips/clip-1' },
      organizationId: 'org-1',
      params: {},
      type: JOB_TYPES.ADD_CAPTIONS,
      userId: 'user-1',
    } as VideoJobData;

    await service.addCaptionsJob(data);

    expect(mockQueue.add).toHaveBeenCalledWith(
      JOB_TYPES.ADD_CAPTIONS,
      data,
      expect.objectContaining({ jobId: 'raw-cut-caption-clip-1' }),
    );
  });

  it('uses the request id for deterministic clip trim jobs', async () => {
    const data = {
      createdAt: new Date(),
      id: 'raw-cut-trim-clip-1',
      ingredientId: 'clip-1',
      metadata: { websocketUrl: '/clips/clip-1' },
      organizationId: 'org-1',
      params: {},
      type: JOB_TYPES.CLIP_TRIM,
      userId: 'user-1',
    } as VideoJobData;

    await service.addClipTrimJob(data);

    expect(mockQueue.add).toHaveBeenCalledWith(
      JOB_TYPES.CLIP_TRIM,
      data,
      expect.objectContaining({ jobId: 'raw-cut-trim-clip-1' }),
    );
  });

  it('does not deduplicate ordinary jobs by their request id', async () => {
    const data = {
      createdAt: new Date(),
      id: 'video-123',
      ingredientId: 'ingredient-1',
      metadata: { websocketUrl: '/ingredients/ingredient-1' },
      organizationId: 'org-1',
      params: {},
      type: JOB_TYPES.ADD_CAPTIONS,
      userId: 'user-1',
    } as VideoJobData;

    await service.addCaptionsJob(data);

    expect(mockQueue.add).toHaveBeenCalledWith(
      JOB_TYPES.ADD_CAPTIONS,
      data,
      expect.not.objectContaining({ jobId: expect.anything() }),
    );
  });

  it('queues clip reference extraction with the bounded job type', async () => {
    const data = {
      createdAt: new Date(),
      id: 'clip-reference-frames-project-1',
      ingredientId: 'project-1',
      metadata: { websocketUrl: '' },
      organizationId: 'org-1',
      params: {
        inputPath: 'https://www.youtube.com/watch?v=test',
        timestamps: [5, 15],
      },
      type: JOB_TYPES.EXTRACT_REFERENCE_FRAMES,
      userId: 'user-1',
    } as VideoJobData;

    await service.addExtractReferenceFramesJob(data);

    expect(mockQueue.add).toHaveBeenCalledWith(
      JOB_TYPES.EXTRACT_REFERENCE_FRAMES,
      data,
      expect.objectContaining({ attempts: 2 }),
    );
  });
});
