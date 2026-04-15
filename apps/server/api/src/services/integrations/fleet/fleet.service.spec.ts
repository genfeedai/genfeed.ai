import { CustomerInstancesService } from '@api/collections/customer-instances/services/customer-instances.service';
import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';

import { FleetService } from './fleet.service';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);

describe('FleetService', () => {
  let service: FleetService;
  let configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;

  const buildConfig = (overrides: Record<string, string> = {}) => ({
    GPU_IMAGES_URL: 'http://images.fleet.local',
    GPU_VIDEOS_URL: 'http://videos.fleet.local',
    GPU_VOICES_URL: 'http://voices.fleet.local',
    ...overrides,
  });

  const createModule = async (
    configValues: Record<string, string> = {},
  ): Promise<void> => {
    const config = buildConfig(configValues);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FleetService,
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
          provide: CustomerInstancesService,
          useValue: {
            findRunningForOrg: vi.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<FleetService>(FleetService);
    configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);
  };

  beforeEach(async () => {
    await createModule();
  });

  afterEach(() => vi.clearAllMocks());

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

    it('getVideosUrl is shorthand for getInstanceUrl("videos")', () => {
      expect(service.getVideosUrl()).toBe(service.getInstanceUrl('videos'));
    });

    it('getVoicesUrl is shorthand for getInstanceUrl("voices")', () => {
      expect(service.getVoicesUrl()).toBe(service.getInstanceUrl('voices'));
    });
  });

  // ── getAllInstances ───────────────────────────────────────────────────────
  describe('getAllInstances', () => {
    it('returns all three configured instances', () => {
      const instances = service.getAllInstances();
      expect(instances).toHaveLength(3);
      const roles = instances.map((i) => i.name);
      expect(roles).toContain('images');
      expect(roles).toContain('voices');
      expect(roles).toContain('videos');
    });
  });

  // ── isAvailable ──────────────────────────────────────────────────────────
  describe('isAvailable', () => {
    it('returns true when health check succeeds', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({ data: { status: 'ok' } });

      const result = await service.isAvailable('images');

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://images.fleet.local/v1/health',
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('returns false when health check throws', async () => {
      mockedAxios.get = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

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

  // ── getFleetHealth ───────────────────────────────────────────────────────
  describe('getFleetHealth', () => {
    it('returns online status for all instances when healthy', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({ data: { status: 'ok' } });

      const result = await service.getFleetHealth();

      expect(result.instances).toHaveLength(3);
      for (const inst of result.instances) {
        expect(inst.status).toBe('online');
      }
      expect(result.timestamp).toBeTruthy();
    });

    it('returns offline status when health check fails', async () => {
      mockedAxios.get = vi.fn().mockRejectedValue(new Error('timeout'));

      const result = await service.getFleetHealth();

      for (const inst of result.instances) {
        expect(inst.status).toBe('offline');
      }
    });

    it('returns unconfigured when URL is empty', async () => {
      await createModule({
        GPU_IMAGES_URL: '',
        GPU_VIDEOS_URL: '',
        GPU_VOICES_URL: '',
      });

      const result = await service.getFleetHealth();

      for (const inst of result.instances) {
        expect(inst.status).toBe('unconfigured');
        expect(inst.url).toBe('');
      }
    });

    it('includes responseTimeMs for online instances', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({ data: {} });

      const result = await service.getFleetHealth();

      for (const inst of result.instances) {
        if (inst.status === 'online') {
          expect(typeof inst.responseTimeMs).toBe('number');
        }
      }
    });
  });

  // ── generateVideo ─────────────────────────────────────────────────────────
  describe('generateVideo', () => {
    it('returns jobId on success', async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue({ data: { job_id: 'vid_job_1' } });

      const result = await service.generateVideo({
        imageUrl: 'https://example.com/img.jpg',
        prompt: 'cinematic pan',
      });

      expect(result).toEqual({ jobId: 'vid_job_1' });
      expect(mockedAxios.post).toHaveBeenCalledWith(
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
      mockedAxios.post = vi.fn();

      const result = await service.generateVideo({
        imageUrl: 'https://example.com/img.jpg',
        prompt: 'test',
      });

      expect(result).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('returns null and logs error when axios throws', async () => {
      mockedAxios.post = vi.fn().mockRejectedValue(new Error('API error'));

      const result = await service.generateVideo({
        imageUrl: 'https://example.com/img.jpg',
        prompt: 'test',
      });

      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('uses default params when not provided', async () => {
      mockedAxios.post = vi.fn().mockResolvedValue({ data: { job_id: 'j1' } });

      await service.generateVideo({
        imageUrl: 'https://example.com/img.jpg',
        prompt: 'test',
      });

      const body = (mockedAxios.post as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as Record<string, unknown>;
      expect(body.fps).toBe(16);
      expect(body.num_frames).toBe(81);
      expect(body.seed).toBe(42);
    });
  });

  // ── generateVoice ─────────────────────────────────────────────────────────
  describe('generateVoice', () => {
    it('returns jobId on success', async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue({ data: { job_id: 'voice_job_1' } });

      const result = await service.generateVoice({ text: 'Hello world' });

      expect(result).toEqual({ jobId: 'voice_job_1' });
    });

    it('returns null when voices not configured', async () => {
      await createModule({ GPU_VOICES_URL: '' });

      const result = await service.generateVoice({ text: 'Hello' });
      expect(result).toBeNull();
    });

    it('returns null and logs on error', async () => {
      mockedAxios.post = vi.fn().mockRejectedValue(new Error('fail'));

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
      mockedAxios.get = vi.fn().mockResolvedValue({ data: jobData });

      const result = await service.pollJob('videos', 'vid_job_1');
      expect(result).toEqual(jobData);
    });

    it('returns null when role not configured', async () => {
      await createModule({ GPU_VIDEOS_URL: '' });

      const result = await service.pollJob('videos', 'vid_job_1');
      expect(result).toBeNull();
    });

    it('returns null and logs on error', async () => {
      mockedAxios.get = vi.fn().mockRejectedValue(new Error('timeout'));

      const result = await service.pollJob('videos', 'some_job');
      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── cloneVoice ────────────────────────────────────────────────────────────
  describe('cloneVoice', () => {
    it('returns jobId when clone succeeds', async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue({ data: { job_id: 'clone_1' } });

      const result = await service.cloneVoice({
        audioUrl: 'https://example.com/sample.wav',
        handle: 'aria',
        label: 'Aria Voice',
      });

      expect(result).toEqual({ jobId: 'clone_1' });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://voices.fleet.local/voices/clone',
        expect.objectContaining({
          audio_url: 'https://example.com/sample.wav',
          handle: 'aria',
          label: 'Aria Voice',
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

  // ── getVoiceProfiles ──────────────────────────────────────────────────────
  describe('getVoiceProfiles', () => {
    it('returns voice profiles from voices key', async () => {
      const profiles = [
        { handle: 'aria', label: 'Aria' },
        { handle: 'nova', label: 'Nova' },
      ];
      mockedAxios.get = vi
        .fn()
        .mockResolvedValue({ data: { voices: profiles } });

      const result = await service.getVoiceProfiles();
      expect(result).toEqual(profiles);
    });

    it('falls back to direct array response', async () => {
      const profiles = [{ handle: 'aria', label: 'Aria' }];
      mockedAxios.get = vi.fn().mockResolvedValue({ data: profiles });

      const result = await service.getVoiceProfiles();
      expect(result).toEqual(profiles);
    });

    it('returns null when voices not configured', async () => {
      await createModule({ GPU_VOICES_URL: '' });
      const result = await service.getVoiceProfiles();
      expect(result).toBeNull();
    });

    it('returns null and logs on error', async () => {
      mockedAxios.get = vi.fn().mockRejectedValue(new Error('network error'));
      const result = await service.getVoiceProfiles();
      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
