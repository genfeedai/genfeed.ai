import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { SERVER_TOKENS } from '@server/server.dependencies';
import type { Mocked } from 'vitest';

import { ManagedInferenceRuntimeService } from './managed-inference-runtime.service';

const { mockedAxiosGet, mockedAxiosPost } = vi.hoisted(() => ({
  mockedAxiosGet: vi.fn(),
  mockedAxiosPost: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    get: mockedAxiosGet,
    post: mockedAxiosPost,
  },
}));

describe('ManagedInferenceRuntimeService', () => {
  let service: ManagedInferenceRuntimeService;
  let _configService: Mocked<ConfigService>;
  let loggerService: Mocked<LoggerService>;
  let customerInstancesService: {
    findRunningForOrg: ReturnType<typeof vi.fn>;
  };

  const buildConfig = (
    overrides: Record<string, string> = {},
  ): Record<string, string> => ({
    GPU_IMAGES_URL: 'http://images.fleet.local',
    GPU_VIDEOS_URL: 'http://videos.fleet.local',
    GPU_VOICES_URL: 'http://voices.fleet.local',
    ...overrides,
  });

  const createModule = async (
    configValues: Record<string, string> = {},
  ): Promise<void> => {
    const config = buildConfig(configValues);

    customerInstancesService = {
      findRunningForOrg: vi.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagedInferenceRuntimeService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => config[key] ?? ''),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: SERVER_TOKENS.customerInstances,
          useValue: customerInstancesService,
        },
      ],
    }).compile();

    service = module.get<ManagedInferenceRuntimeService>(
      ManagedInferenceRuntimeService,
    );
    _configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);
  };

  beforeEach(async () => {
    await createModule();
  });

  afterEach(() => vi.resetAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── getInstanceUrl ───────────────────────────────────────────────────────
  describe('getInstanceUrl', () => {
    it('returns the configured URL for each role', () => {
      expect(service.getInstanceUrl('images')).toBe(
        'http://images.fleet.local',
      );
      expect(service.getInstanceUrl('voices')).toBe(
        'http://voices.fleet.local',
      );
      expect(service.getInstanceUrl('videos')).toBe(
        'http://videos.fleet.local',
      );
    });

    it('returns null when URL is not configured', async () => {
      await createModule({
        GPU_IMAGES_URL: '',
        GPU_VIDEOS_URL: '',
        GPU_VOICES_URL: '',
      });
      expect(service.getInstanceUrl('images')).toBeNull();
      expect(service.getInstanceUrl('voices')).toBeNull();
      expect(service.getInstanceUrl('videos')).toBeNull();
    });
  });

  // ── isAvailable ──────────────────────────────────────────────────────────
  describe('isAvailable', () => {
    it('returns true when health check succeeds', async () => {
      mockedAxiosGet.mockResolvedValue({ data: { status: 'ok' } });

      const result = await service.isAvailable('images');

      expect(result).toBe(true);
      expect(mockedAxiosGet).toHaveBeenCalledWith(
        'http://images.fleet.local/v1/health',
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('returns false when health check throws', async () => {
      mockedAxiosGet.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.isAvailable('images');

      expect(result).toBe(false);
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('returns false when role is not configured', async () => {
      await createModule({ GPU_IMAGES_URL: '' });

      const result = await service.isAvailable('images');
      expect(result).toBe(false);
    });
  });

  // ── generateVideo ─────────────────────────────────────────────────────────
  describe('generateVideo', () => {
    it('returns jobId on success', async () => {
      mockedAxiosPost.mockResolvedValue({ data: { job_id: 'vid_job_1' } });

      const result = await service.generateVideo({
        imageUrl: 'https://example.com/img.jpg',
        prompt: 'cinematic pan',
      });

      expect(result).toEqual({ jobId: 'vid_job_1' });
      expect(mockedAxiosPost).toHaveBeenCalledWith(
        'http://videos.fleet.local/generate/video',
        expect.objectContaining({
          image_url: 'https://example.com/img.jpg',
          prompt: 'cinematic pan',
        }),
        expect.any(Object),
      );
    });

    it('returns null when videos instance not configured', async () => {
      await createModule({ GPU_VIDEOS_URL: '' });
      mockedAxiosPost.mockReset();

      const result = await service.generateVideo({
        imageUrl: 'https://example.com/img.jpg',
        prompt: 'test',
      });

      expect(result).toBeNull();
      expect(mockedAxiosPost).not.toHaveBeenCalled();
    });

    it('returns null and logs error when axios throws', async () => {
      mockedAxiosPost.mockRejectedValue(new Error('API error'));

      const result = await service.generateVideo({
        imageUrl: 'https://example.com/img.jpg',
        prompt: 'test',
      });

      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('uses the dedicated org instance when one is running', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue({
        apiUrl: 'http://customer-video.local',
      });
      mockedAxiosPost.mockResolvedValue({ data: { job_id: 'customer-job' } });

      const result = await service.generateVideo({
        imageUrl: 'https://example.com/img.jpg',
        organizationId: 'org-1',
        prompt: 'customer prompt',
      });

      expect(result).toEqual({ jobId: 'customer-job' });
      expect(mockedAxiosPost).toHaveBeenCalledWith(
        'http://customer-video.local/generate/video',
        expect.objectContaining({ prompt: 'customer prompt' }),
        expect.any(Object),
      );
    });

    it('requires a dedicated org instance for managed GenfeedAI video', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue(null);
      mockedAxiosPost.mockReset();

      const result = await service.generateManagedVideoForOrg({
        imageUrl: 'https://example.com/img.jpg',
        organizationId: 'org-1',
        prompt: 'managed prompt',
      });

      expect(result).toBeNull();
      expect(mockedAxiosPost).not.toHaveBeenCalled();
    });

    it('runs managed GenfeedAI video on the dedicated org instance', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue({
        apiUrl: 'http://managed-video.local',
      });
      mockedAxiosPost.mockResolvedValue({ data: { job_id: 'managed-job' } });

      const result = await service.generateManagedVideoForOrg({
        imageUrl: 'https://example.com/img.jpg',
        organizationId: 'org-1',
        prompt: 'managed prompt',
      });

      expect(result).toEqual({ jobId: 'managed-job' });
      expect(mockedAxiosPost).toHaveBeenCalledWith(
        'http://managed-video.local/generate/video',
        expect.objectContaining({ prompt: 'managed prompt' }),
        expect.any(Object),
      );
    });

    it('does not enable managed GenfeedAI video without a dedicated API URL', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue({});

      await expect(
        service.hasDedicatedInstanceForOrg('org-1', 'videos'),
      ).resolves.toBe(false);
    });

    it('uses default params when not provided', async () => {
      mockedAxiosPost.mockResolvedValue({ data: { job_id: 'j1' } });

      await service.generateVideo({
        imageUrl: 'https://example.com/img.jpg',
        prompt: 'test',
      });

      const body = mockedAxiosPost.mock.calls[0][1] as Record<string, unknown>;
      expect(body.fps).toBe(16);
      expect(body.num_frames).toBe(81);
      expect(body.seed).toBe(42);
    });
  });

  // ── generateVoice ─────────────────────────────────────────────────────────
  describe('generateVoice', () => {
    it('returns jobId on success', async () => {
      mockedAxiosPost.mockResolvedValue({ data: { job_id: 'voice_job_1' } });

      const result = await service.generateVoice({ text: 'Hello world' });

      expect(result).toEqual({ jobId: 'voice_job_1' });
    });

    it('returns null when voices not configured', async () => {
      await createModule({ GPU_VOICES_URL: '' });

      const result = await service.generateVoice({ text: 'Hello' });
      expect(result).toBeNull();
    });

    it('returns null and logs on error', async () => {
      mockedAxiosPost.mockRejectedValue(new Error('fail'));

      const result = await service.generateVoice({ text: 'Hello' });
      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── pollJob ───────────────────────────────────────────────────────────────
  describe('pollJob', () => {
    it('returns job data on success', async () => {
      const jobData = {
        output_url: 'https://cdn.example.com/out.mp4',
        status: 'completed',
      };
      mockedAxiosGet.mockResolvedValue({ data: jobData });

      const result = await service.pollJob('videos', 'vid_job_1');
      expect(result).toEqual(jobData);
    });

    it('returns null when role not configured', async () => {
      await createModule({ GPU_VIDEOS_URL: '' });

      const result = await service.pollJob('videos', 'vid_job_1');
      expect(result).toBeNull();
    });

    it('returns null and logs on error', async () => {
      mockedAxiosGet.mockRejectedValue(new Error('timeout'));

      const result = await service.pollJob('videos', 'some_job');
      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── pollManagedJobForOrg ─────────────────────────────────────────────────
  describe('pollManagedJobForOrg', () => {
    it('polls the dedicated org instance only', async () => {
      const jobData = { output_url: 'https://cdn.example.com/out.mp4' };
      customerInstancesService.findRunningForOrg.mockResolvedValue({
        apiUrl: 'http://managed-video.local',
      });
      mockedAxiosGet.mockResolvedValue({ data: jobData });

      const result = await service.pollManagedJobForOrg(
        'org-1',
        'videos',
        'job-1',
      );

      expect(result).toEqual(jobData);
      expect(mockedAxiosGet).toHaveBeenCalledWith(
        'http://managed-video.local/generate/job-1',
        expect.objectContaining({ timeout: 10000 }),
      );
    });

    it('does not fall back to the shared fleet URL', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue(null);
      mockedAxiosGet.mockReset();

      const result = await service.pollManagedJobForOrg(
        'org-1',
        'videos',
        'job-1',
      );

      expect(result).toBeNull();
      expect(mockedAxiosGet).not.toHaveBeenCalled();
    });
  });

  // ── cloneVoice ────────────────────────────────────────────────────────────
  describe('cloneVoice', () => {
    it('returns jobId when clone succeeds', async () => {
      mockedAxiosPost.mockResolvedValue({ data: { job_id: 'clone_1' } });

      const result = await service.cloneVoice({
        audioUrl: 'https://example.com/sample.wav',
        handle: 'aria',
        label: 'Aria Voice',
      });

      expect(result).toEqual({ jobId: 'clone_1' });
      expect(mockedAxiosPost).toHaveBeenCalledWith(
        'http://voices.fleet.local/voices/clone',
        expect.objectContaining({
          audio_url: 'https://example.com/sample.wav',
          handle: 'aria',
          label: 'Aria Voice',
        }),
        expect.any(Object),
      );
    });

    it('sends a Fleet voice clone completion callback URL when configured', async () => {
      await createModule({
        FLEET_WEBHOOK_SECRET: 'fleet-secret',
        GENFEEDAI_WEBHOOKS_URL: 'https://webhooks.test',
      });
      mockedAxiosPost.mockResolvedValue({ data: { job_id: 'clone_1' } });

      await service.cloneVoice({
        audioUrl: 'https://example.com/sample.wav',
        handle: 'aria',
        label: 'Aria Voice',
      });

      expect(mockedAxiosPost).toHaveBeenCalledWith(
        'http://voices.fleet.local/voices/clone',
        expect.objectContaining({
          callback_url:
            'https://webhooks.test/v1/webhooks/fleet/voice-clone?token=fleet-secret',
        }),
        expect.any(Object),
      );
    });

    it('returns null when voices not configured', async () => {
      await createModule({ GPU_VOICES_URL: '' });

      const result = await service.cloneVoice({
        audioUrl: 'url',
        handle: 'h',
        label: 'l',
      });

      expect(result).toBeNull();
    });
  });
});
