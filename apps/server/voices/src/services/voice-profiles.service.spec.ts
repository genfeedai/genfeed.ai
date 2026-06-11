import { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TTSInferenceService } from '@voices/services/tts-inference.service';
import { VoiceProfilesService } from '@voices/services/voice-profiles.service';
import type { Mocked } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** In-memory fake of the node-redis publisher surface used by the service. */
function createMockPublisher() {
  const store = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    store,
  };
}

type MockPublisher = ReturnType<typeof createMockPublisher>;

function createMockRedisService(publisher: MockPublisher | null): RedisService {
  return {
    getPublisher: vi.fn(() => publisher),
  } as unknown as RedisService;
}

describe('VoiceProfilesService', () => {
  let service: VoiceProfilesService;
  let loggerService: Mocked<LoggerService>;
  let ttsInferenceService: Mocked<TTSInferenceService>;

  beforeEach(async () => {
    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Mocked<LoggerService>;

    const mockTTSInferenceService = {
      getStatus: vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' }),
    } as unknown as Mocked<TTSInferenceService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoiceProfilesService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: TTSInferenceService, useValue: mockTTSInferenceService },
      ],
    }).compile();

    service = module.get<VoiceProfilesService>(VoiceProfilesService);
    loggerService = module.get(LoggerService);
    ttsInferenceService = module.get(TTSInferenceService);

    vi.clearAllMocks();
  });

  describe('cloneVoice', () => {
    it('should create a profile with status cloning and return immediately', async () => {
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });

      const result = await service.cloneVoice({
        audioUrl: 'https://cdn.example.com/alice.wav',
        handle: 'alice',
        label: 'Alice Voice',
      });

      expect(result).toMatchObject({
        audioUrl: 'https://cdn.example.com/alice.wav',
        handle: 'alice',
        label: 'Alice Voice',
        status: 'cloning',
      });
      expect(result.createdAt).toBeDefined();
    });

    it('should fall back to handle as label when label is omitted', async () => {
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });

      const result = await service.cloneVoice({
        audioUrl: 'https://cdn.example.com/bob.wav',
        handle: 'bob',
      });

      expect(result.label).toBe('bob');
    });

    it('should update profile to ready after validation succeeds', async () => {
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });

      await service.cloneVoice({
        audioUrl: 'https://cdn.example.com/carol.wav',
        handle: 'carol',
      });

      // Let the async validateClone settle
      await new Promise((r) => setTimeout(r, 20));

      const profile = await service.getVoice('carol');
      expect(profile.status).toBe('ready');
    });

    it('should update profile to failed when inference is offline', async () => {
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: false, status: 'offline' });

      await service.cloneVoice({
        audioUrl: 'https://cdn.example.com/dave.wav',
        handle: 'dave',
      });

      await new Promise((r) => setTimeout(r, 20));

      const profile = await service.getVoice('dave');
      expect(profile.status).toBe('failed');
    });

    it('should log validation error without throwing', async () => {
      ttsInferenceService.getStatus = vi
        .fn()
        .mockRejectedValue(new Error('Network error'));

      await service.cloneVoice({
        audioUrl: 'https://cdn.example.com/eve.wav',
        handle: 'eve',
      });

      await new Promise((r) => setTimeout(r, 20));

      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('listVoices', () => {
    it('should return empty array when no profiles exist', async () => {
      const result = await service.listVoices();
      expect(result).toEqual([]);
    });

    it('should return all cloned voices', async () => {
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });

      await service.cloneVoice({
        audioUrl: 'https://cdn.example.com/1.wav',
        handle: 'voice-1',
      });
      await service.cloneVoice({
        audioUrl: 'https://cdn.example.com/2.wav',
        handle: 'voice-2',
      });

      const result = await service.listVoices();
      expect(result).toHaveLength(2);
      expect(result.map((v) => v.handle)).toContain('voice-1');
      expect(result.map((v) => v.handle)).toContain('voice-2');
    });
  });

  describe('getVoice', () => {
    it('should return existing profile by handle', async () => {
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });

      await service.cloneVoice({
        audioUrl: 'https://cdn.example.com/frank.wav',
        handle: 'frank',
      });

      const profile = await service.getVoice('frank');
      expect(profile.handle).toBe('frank');
    });

    it('should throw NotFoundException for unknown handle', async () => {
      await expect(service.getVoice('nobody')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with descriptive message', async () => {
      await expect(service.getVoice('unknown-handle')).rejects.toThrow(
        '"unknown-handle" not found',
      );
    });
  });

  describe('Redis persistence', () => {
    let publisher: MockPublisher;
    let redisBackedService: VoiceProfilesService;

    beforeEach(() => {
      publisher = createMockPublisher();
      redisBackedService = new VoiceProfilesService(
        loggerService,
        ttsInferenceService,
        createMockRedisService(publisher),
      );
    });

    it('persists profiles to Redis when a voice is cloned', async () => {
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });

      await redisBackedService.cloneVoice({
        audioUrl: 'https://cdn.example.com/grace.wav',
        handle: 'grace',
      });

      const raw = publisher.store.get('voices:profiles');
      expect(raw).toBeDefined();
      const persisted = JSON.parse(raw as string) as Record<
        string,
        { handle: string }
      >;
      expect(persisted.grace?.handle).toBe('grace');
    });

    it('persists the status transition after validation settles', async () => {
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });

      await redisBackedService.cloneVoice({
        audioUrl: 'https://cdn.example.com/henry.wav',
        handle: 'henry',
      });

      await new Promise((r) => setTimeout(r, 20));

      const persisted = JSON.parse(
        publisher.store.get('voices:profiles') as string,
      ) as Record<string, { status: string }>;
      expect(persisted.henry?.status).toBe('ready');
    });

    it('restores profiles from Redis on module init', async () => {
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });

      await redisBackedService.cloneVoice({
        audioUrl: 'https://cdn.example.com/iris.wav',
        handle: 'iris',
      });
      await new Promise((r) => setTimeout(r, 20));

      // Simulate a service restart: fresh instance, same Redis store.
      const restarted = new VoiceProfilesService(
        loggerService,
        ttsInferenceService,
        createMockRedisService(publisher),
      );
      await restarted.onModuleInit();

      const profile = await restarted.getVoice('iris');
      expect(profile.handle).toBe('iris');
      expect(profile.status).toBe('ready');
    });

    it('skips restore and works in-memory when Redis is unavailable', async () => {
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });

      const offlineService = new VoiceProfilesService(
        loggerService,
        ttsInferenceService,
        createMockRedisService(null),
      );
      await offlineService.onModuleInit();

      const result = await offlineService.cloneVoice({
        audioUrl: 'https://cdn.example.com/jack.wav',
        handle: 'jack',
      });

      expect(result.status).toBe('cloning');
      expect(await offlineService.listVoices()).toHaveLength(1);
    });

    it('warns instead of throwing when persistence fails', async () => {
      ttsInferenceService.getStatus = vi
        .fn()
        .mockResolvedValue({ modelLoaded: true, status: 'online' });
      publisher.set.mockRejectedValueOnce(new Error('redis down'));

      const result = await redisBackedService.cloneVoice({
        audioUrl: 'https://cdn.example.com/kate.wav',
        handle: 'kate',
      });

      expect(result.handle).toBe('kate');
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          message: 'Failed to persist voice profiles to Redis',
        }),
      );
    });

    it('warns instead of throwing when restore fails', async () => {
      publisher.get.mockRejectedValueOnce(new Error('redis down'));

      const restarted = new VoiceProfilesService(
        loggerService,
        ttsInferenceService,
        createMockRedisService(publisher),
      );
      await restarted.onModuleInit();

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          message: 'Failed to restore voice profiles from Redis',
        }),
      );
      expect(await restarted.listVoices()).toEqual([]);
    });
  });
});
