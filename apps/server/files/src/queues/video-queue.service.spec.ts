import { VideoQueueService } from '@files/queues/video-queue.service';
import type { VideoJobData } from '@files/shared/interfaces/job.interface';
import {
  FILE_JOB_TYPES as JOB_TYPES,
  FILE_QUEUE_NAMES as QUEUE_NAMES,
} from '@genfeedai/contracts/queue';
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
    mockQueue.getJob.mockReset();
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

  it('does not deduplicate ordinary audio extraction jobs by request id', async () => {
    const data = {
      createdAt: new Date(),
      id: 'clip-audio-project-1',
      ingredientId: 'project-1',
      metadata: { websocketUrl: '/clips/project-1' },
      organizationId: 'org-1',
      params: { inputPath: 'https://cdn.test/source.mp4' },
      type: JOB_TYPES.VIDEO_TO_AUDIO,
      userId: 'user-1',
    } as VideoJobData;

    await service.addVideoToAudioJob(data);

    expect(mockQueue.add).toHaveBeenCalledWith(
      JOB_TYPES.VIDEO_TO_AUDIO,
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
  function sourceData(overrides: Partial<VideoJobData> = {}): VideoJobData {
    const ingredientId = `c${'a'.repeat(48)}`;
    return {
      createdAt: new Date(),
      id: `agent-source-${ingredientId}`,
      ingredientId,
      metadata: { websocketUrl: '' },
      organizationId: 'org-1',
      params: { inputPath: 'https://www.youtube.com/watch?v=abcdefghijk' },
      type: JOB_TYPES.VIDEO_TO_AUDIO,
      userId: 'user-1',
      ...overrides,
    };
  }

  it('uses the scoped source ingredient identity for deterministic extraction', async () => {
    const data = sourceData();
    await service.addVideoToAudioJob(data);
    expect(mockQueue.add).toHaveBeenCalledWith(
      JOB_TYPES.VIDEO_TO_AUDIO,
      data,
      expect.objectContaining({ jobId: data.id }),
    );
  });

  it.each([
    { id: 'agent-source-arbitrary' },
    { ingredientId: 'arbitrary', id: 'agent-source-arbitrary' },
    { id: `agent-source-c${'b'.repeat(48)}` },
    {
      ingredientId: `c${'a'.repeat(48)}:foreign`,
      id: `agent-source-c${'a'.repeat(48)}:foreign`,
    },
  ])(
    'does not grant deterministic source IDs for malformed or mismatched identity',
    async (overrides) => {
      const data = sourceData(overrides);
      await service.addVideoToAudioJob(data);
      expect(mockQueue.add).toHaveBeenCalledWith(
        JOB_TYPES.VIDEO_TO_AUDIO,
        data,
        expect.not.objectContaining({ jobId: expect.anything() }),
      );
    },
  );

  it('preserves existing raw-cut audio job identities', async () => {
    const data = sourceData({
      id: 'raw-cut-audio-source',
      ingredientId: 'source',
    });
    await service.addVideoToAudioJob(data);
    expect(mockQueue.add).toHaveBeenCalledWith(
      JOB_TYPES.VIDEO_TO_AUDIO,
      data,
      expect.objectContaining({ jobId: data.id }),
    );
  });

  it('does not extend source deduplication to other video jobs', async () => {
    const data = sourceData({ type: JOB_TYPES.ADD_CAPTIONS });
    await service.addCaptionsJob(data);
    expect(mockQueue.add).toHaveBeenCalledWith(
      JOB_TYPES.ADD_CAPTIONS,
      data,
      expect.not.objectContaining({ jobId: expect.anything() }),
    );
  });

  it('retries the original failed extraction without replacing its identity or payload', async () => {
    const original = {
      getState: vi.fn().mockResolvedValue('failed'),
      retry: vi.fn().mockResolvedValue(undefined),
    };
    mockQueue.getJob.mockResolvedValue(original);
    expect(await service.addVideoToAudioJob(sourceData())).toBe(original);
    expect(original.retry).toHaveBeenCalledWith('failed');
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('tolerates a concurrent retry that has already moved the same failed job', async () => {
    const original = {
      getState: vi
        .fn()
        .mockResolvedValueOnce('failed')
        .mockResolvedValue('waiting'),
      retry: vi.fn().mockRejectedValue(new Error('already retried')),
    };
    mockQueue.getJob.mockResolvedValue(original);
    expect(await service.addVideoToAudioJob(sourceData())).toBe(original);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('propagates failed retry infrastructure errors without adding another job', async () => {
    const original = {
      getState: vi.fn().mockResolvedValue('failed'),
      retry: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
    };
    mockQueue.getJob.mockResolvedValue(original);
    await expect(service.addVideoToAudioJob(sourceData())).rejects.toThrow(
      'Redis unavailable',
    );
    expect(mockQueue.add).not.toHaveBeenCalled();
  });
});
