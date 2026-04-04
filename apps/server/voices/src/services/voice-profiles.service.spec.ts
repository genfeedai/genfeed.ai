import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TTSInferenceService } from '@voices/services/tts-inference.service';
import { VoiceProfilesService } from '@voices/services/voice-profiles.service';
import type { Mocked } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
