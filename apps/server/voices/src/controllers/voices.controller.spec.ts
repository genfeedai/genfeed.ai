import { Test, TestingModule } from '@nestjs/testing';
import { VoicesController } from '@voices/controllers/voices.controller';
import { VoiceProfilesService } from '@voices/services/voice-profiles.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('VoicesController', () => {
  let controller: VoicesController;
  let mockVoiceProfilesService: {
    cloneVoice: ReturnType<typeof vi.fn>;
    listVoices: ReturnType<typeof vi.fn>;
    getVoice: ReturnType<typeof vi.fn>;
  };

  const mockProfile = {
    audioUrl: 'https://example.com/sample.wav',
    createdAt: '2026-03-16T06:00:00.000Z',
    handle: 'luna',
    label: 'Luna Voice',
    status: 'ready',
  };

  beforeEach(async () => {
    mockVoiceProfilesService = {
      cloneVoice: vi.fn().mockResolvedValue(mockProfile),
      getVoice: vi.fn().mockResolvedValue(mockProfile),
      listVoices: vi.fn().mockResolvedValue([mockProfile]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoicesController],
      providers: [
        { provide: VoiceProfilesService, useValue: mockVoiceProfilesService },
      ],
    }).compile();

    controller = module.get<VoicesController>(VoicesController);
  });

  describe('cloneVoice', () => {
    it('should call voiceProfilesService.cloneVoice with request body', async () => {
      const body = {
        audioUrl: 'https://example.com/audio.wav',
        handle: 'luna',
        label: 'Luna',
      };

      const result = await controller.cloneVoice(body);

      expect(mockVoiceProfilesService.cloneVoice).toHaveBeenCalledWith(body);
      expect(result).toEqual(mockProfile);
    });

    it('should call cloneVoice without label when not provided', async () => {
      const body = {
        audioUrl: 'https://example.com/audio.wav',
        handle: 'luna',
      };

      await controller.cloneVoice(body);

      expect(mockVoiceProfilesService.cloneVoice).toHaveBeenCalledWith(body);
    });

    it('should propagate error from voiceProfilesService', async () => {
      mockVoiceProfilesService.cloneVoice.mockRejectedValue(
        new Error('Clone failed'),
      );

      await expect(
        controller.cloneVoice({
          audioUrl: 'https://example.com/audio.wav',
          handle: 'luna',
        }),
      ).rejects.toThrow('Clone failed');
    });
  });

  describe('listVoices', () => {
    it('should return array of voice profiles', async () => {
      const result = await controller.listVoices();

      expect(mockVoiceProfilesService.listVoices).toHaveBeenCalled();
      expect(result).toEqual([mockProfile]);
    });

    it('should return empty array when no voices exist', async () => {
      mockVoiceProfilesService.listVoices.mockResolvedValue([]);

      const result = await controller.listVoices();

      expect(result).toEqual([]);
    });

    it('should propagate service errors', async () => {
      mockVoiceProfilesService.listVoices.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(controller.listVoices()).rejects.toThrow('DB error');
    });
  });

  describe('getVoice', () => {
    it('should return a voice profile by handle', async () => {
      const result = await controller.getVoice('luna');

      expect(mockVoiceProfilesService.getVoice).toHaveBeenCalledWith('luna');
      expect(result).toEqual(mockProfile);
    });

    it('should propagate NotFoundException when profile not found', async () => {
      mockVoiceProfilesService.getVoice.mockRejectedValue(
        new Error('Voice profile "ghost" not found'),
      );

      await expect(controller.getVoice('ghost')).rejects.toThrow(
        'Voice profile "ghost" not found',
      );
    });

    it('should call getVoice with the exact handle param', async () => {
      await controller.getVoice('emma-v2');

      expect(mockVoiceProfilesService.getVoice).toHaveBeenCalledWith('emma-v2');
    });
  });
});
