import { SERVER_TOKENS } from '@api/server.dependencies';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
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
  let loggerService: Mocked<LoggerService>;
  let customerInstancesService: {
    findRunningForOrg: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    customerInstancesService = {
      findRunningForOrg: vi.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagedInferenceRuntimeService,
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
    loggerService = module.get(LoggerService);
  });

  afterEach(() => vi.resetAllMocks());

  describe('hasDedicatedInstanceForOrg', () => {
    it('is false without a dedicated API URL', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue({});

      await expect(
        service.hasDedicatedInstanceForOrg('org-1', 'videos'),
      ).resolves.toBe(false);
    });

    it('is true when the organization has a running instance', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue({
        apiUrl: 'http://managed-video.local',
      });

      await expect(
        service.hasDedicatedInstanceForOrg('org-1', 'videos'),
      ).resolves.toBe(true);
    });
  });

  describe('generateManagedVideoForOrg', () => {
    const params = {
      imageUrl: 'https://example.com/img.jpg',
      organizationId: 'org-1',
      prompt: 'managed prompt',
    };

    it('runs on the dedicated org instance', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue({
        apiUrl: 'http://managed-video.local',
      });
      mockedAxiosPost.mockResolvedValue({ data: { job_id: 'managed-job' } });

      const result = await service.generateManagedVideoForOrg(params);

      expect(result).toEqual({ jobId: 'managed-job' });
      expect(mockedAxiosPost).toHaveBeenCalledWith(
        'http://managed-video.local/generate/video',
        expect.objectContaining({
          image_url: 'https://example.com/img.jpg',
          prompt: 'managed prompt',
        }),
        expect.any(Object),
      );
    });

    it('returns null and calls nothing when the organization has no instance', async () => {
      const result = await service.generateManagedVideoForOrg(params);

      expect(result).toBeNull();
      expect(mockedAxiosPost).not.toHaveBeenCalled();
    });

    it('returns null when the instance lookup fails', async () => {
      customerInstancesService.findRunningForOrg.mockRejectedValue(
        new Error('lookup failed'),
      );

      const result = await service.generateManagedVideoForOrg(params);

      expect(result).toBeNull();
      expect(mockedAxiosPost).not.toHaveBeenCalled();
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('returns null and logs when the instance rejects the request', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue({
        apiUrl: 'http://managed-video.local',
      });
      mockedAxiosPost.mockRejectedValue(new Error('API error'));

      const result = await service.generateManagedVideoForOrg(params);

      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('fills default generation params', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue({
        apiUrl: 'http://managed-video.local',
      });
      mockedAxiosPost.mockResolvedValue({ data: { job_id: 'j1' } });

      await service.generateManagedVideoForOrg(params);

      const body = mockedAxiosPost.mock.calls[0][1] as Record<string, unknown>;
      expect(body.fps).toBe(16);
      expect(body.num_frames).toBe(81);
      expect(body.seed).toBe(42);
    });
  });

  describe('generateManagedVoiceForOrg', () => {
    it('runs on the dedicated org voices instance', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue({
        apiUrl: 'http://managed-voice.local',
      });
      mockedAxiosPost.mockResolvedValue({ data: { job_id: 'voice_job_1' } });

      const result = await service.generateManagedVoiceForOrg({
        organizationId: 'org-1',
        text: 'Hello world',
      });

      expect(result).toEqual({ jobId: 'voice_job_1' });
      expect(customerInstancesService.findRunningForOrg).toHaveBeenCalledWith(
        'org-1',
        'voices',
      );
      expect(mockedAxiosPost).toHaveBeenCalledWith(
        'http://managed-voice.local/generate/tts',
        expect.objectContaining({ text: 'Hello world' }),
        expect.any(Object),
      );
    });

    it('returns null and calls nothing when the organization has no instance', async () => {
      const result = await service.generateManagedVoiceForOrg({
        organizationId: 'org-1',
        text: 'Hello',
      });

      expect(result).toBeNull();
      expect(mockedAxiosPost).not.toHaveBeenCalled();
    });

    it('returns null and logs on error', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue({
        apiUrl: 'http://managed-voice.local',
      });
      mockedAxiosPost.mockRejectedValue(new Error('fail'));

      const result = await service.generateManagedVoiceForOrg({
        organizationId: 'org-1',
        text: 'Hello',
      });

      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

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

    it('returns null and calls nothing when the organization has no instance', async () => {
      const result = await service.pollManagedJobForOrg(
        'org-1',
        'videos',
        'job-1',
      );

      expect(result).toBeNull();
      expect(mockedAxiosGet).not.toHaveBeenCalled();
    });

    it('returns null and logs on error', async () => {
      customerInstancesService.findRunningForOrg.mockResolvedValue({
        apiUrl: 'http://managed-video.local',
      });
      mockedAxiosGet.mockRejectedValue(new Error('timeout'));

      const result = await service.pollManagedJobForOrg(
        'org-1',
        'videos',
        'some_job',
      );

      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
