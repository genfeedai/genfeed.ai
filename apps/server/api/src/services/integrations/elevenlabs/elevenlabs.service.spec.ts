import fs from 'node:fs';
import { ConfigService } from '@api/config/config.service';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  createReadStream: vi.fn().mockReturnValue('mock-stream'),
  default: {
    createReadStream: vi.fn().mockReturnValue('mock-stream'),
  },
}));

vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: vi.fn(),
}));

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

describe('ElevenLabsService', () => {
  let service: ElevenLabsService;
  let ttsConvertMock: ReturnType<typeof vi.fn>;
  let voicesGetAllMock: ReturnType<typeof vi.fn>;
  let voicesAddMock: ReturnType<typeof vi.fn>;
  let voicesDeleteMock: ReturnType<typeof vi.fn>;
  let forcedAlignmentMock: ReturnType<typeof vi.fn>;
  let filesClientMock: Record<string, ReturnType<typeof vi.fn>>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    ttsConvertMock = vi.fn();
    voicesGetAllMock = vi.fn();
    voicesAddMock = vi.fn();
    voicesDeleteMock = vi.fn();
    forcedAlignmentMock = vi.fn();
    filesClientMock = {
      uploadToS3: vi.fn().mockResolvedValue({
        duration: 5,
        publicUrl: 'https://cdn.example.com/audio.mp3',
      }),
    };
    logger = createMockLogger();

    (
      ElevenLabsClient as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(function () {
      return {
        forcedAlignment: { create: forcedAlignmentMock },
        textToSpeech: { convertWithTimestamps: ttsConvertMock },
        voices: {
          add: voicesAddMock,
          delete: voicesDeleteMock,
          getAll: voicesGetAllMock,
        },
      };
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElevenLabsService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('eleven_monolingual_v1') },
        },
        { provide: LoggerService, useValue: logger },
        {
          provide: ApiKeyHelperService,
          useValue: { getApiKey: vi.fn().mockReturnValue('mock-api-key') },
        },
        { provide: FilesClientService, useValue: filesClientMock },
      ],
    }).compile();

    service = module.get<ElevenLabsService>(ElevenLabsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getVoices', () => {
    it('should return mapped voices from ElevenLabs API', async () => {
      voicesGetAllMock.mockResolvedValue({
        voices: [
          {
            name: 'Rachel',
            preview_url: 'https://preview.com/rachel.mp3',
            voice_id: 'voice1',
          },
          { name: 'Adam', preview_url: null, voice_id: 'voice2' },
        ],
      });

      const result = await service.getVoices();
      expect(result).toEqual([
        {
          name: 'Rachel',
          preview: 'https://preview.com/rachel.mp3',
          voiceId: 'voice1',
        },
        { name: 'Adam', preview: null, voiceId: 'voice2' },
      ]);
    });

    it('should use API key override when provided', async () => {
      voicesGetAllMock.mockResolvedValue({ voices: [] });

      await service.getVoices(undefined, undefined, 'custom-key');
      expect(ElevenLabsClient).toHaveBeenCalledWith({ apiKey: 'custom-key' });
    });

    it('should propagate API errors', async () => {
      voicesGetAllMock.mockRejectedValue(new Error('API rate limited'));

      await expect(service.getVoices()).rejects.toThrow('API rate limited');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('textToSpeech', () => {
    it('should call ElevenLabs TTS with correct params', async () => {
      ttsConvertMock.mockResolvedValue({ audio: [] });

      await service.textToSpeech('voice1', 'Hello world');
      expect(ttsConvertMock).toHaveBeenCalledWith('voice1', {
        modelId: 'eleven_monolingual_v1',
        outputFormat: 'mp3_44100_128',
        text: 'Hello world',
      });
    });
  });

  describe('generateAndUploadAudio', () => {
    it('should generate audio, upload to S3, and return URL with duration', async () => {
      const audioChunks = [Buffer.from('chunk1'), Buffer.from('chunk2')];
      ttsConvertMock.mockResolvedValue({
        audio: audioChunks,
        timestamps: [
          { end: 2, start: 0 },
          { end: 5, start: 2 },
        ],
      });

      const result = await service.generateAndUploadAudio(
        'voice1',
        'Hello world',
        'ingredient-123',
        'org-123',
        'user-123',
      );

      expect(result).toMatchObject({
        audioUrl: 'https://cdn.example.com/audio.mp3',
        duration: 5,
        uploadResult: {
          duration: 5,
          publicUrl: 'https://cdn.example.com/audio.mp3',
        },
      });
      expect(filesClientMock.uploadToS3).toHaveBeenCalledWith(
        'ingredient-123',
        'musics',
        expect.objectContaining({
          contentType: 'audio/mpeg',
          type: 'buffer',
        }),
      );
    });

    it('should use upload result duration when available', async () => {
      ttsConvertMock.mockResolvedValue({
        audio: [Buffer.from('audio')],
        timestamps: [],
      });
      filesClientMock.uploadToS3.mockResolvedValue({
        duration: 10,
        publicUrl: 'https://cdn.example.com/audio.mp3',
      });

      const result = await service.generateAndUploadAudio(
        'voice1',
        'Text',
        'ing-1',
      );
      expect(result.duration).toBe(10);
    });

    it('should throw when upload fails to return public URL', async () => {
      ttsConvertMock.mockResolvedValue({
        audio: [Buffer.from('audio')],
        timestamps: [],
      });
      filesClientMock.uploadToS3.mockResolvedValue({
        duration: 0,
        publicUrl: null,
      });

      await expect(
        service.generateAndUploadAudio('voice1', 'Text', 'ing-1'),
      ).rejects.toThrow('Failed to get public URL after upload');
    });
  });

  describe('cloneVoice', () => {
    it('should clone a voice and return voiceId and name', async () => {
      voicesAddMock.mockResolvedValue({
        name: 'My Voice',
        voice_id: 'cloned_voice_123',
      });

      const result = await service.cloneVoice(
        'My Voice',
        [Buffer.from('audio')],
        { description: 'Test voice', removeBackgroundNoise: true },
      );

      expect(result).toEqual({
        name: 'My Voice',
        voiceId: 'cloned_voice_123',
      });
      expect(voicesAddMock).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test voice',
          files: [expect.any(Buffer)],
          name: 'My Voice',
          remove_background_noise: true,
        }),
      );
    });

    it('should propagate clone errors', async () => {
      voicesAddMock.mockRejectedValue(new Error('Clone limit reached'));

      await expect(
        service.cloneVoice('Voice', [Buffer.from('audio')]),
      ).rejects.toThrow('Clone limit reached');
    });
  });

  describe('deleteVoice', () => {
    it('should delete a voice by ID', async () => {
      voicesDeleteMock.mockResolvedValue(undefined);

      await service.deleteVoice('voice_123');
      expect(voicesDeleteMock).toHaveBeenCalledWith('voice_123');
    });

    it('should propagate delete errors', async () => {
      voicesDeleteMock.mockRejectedValue(new Error('Voice not found'));

      await expect(service.deleteVoice('invalid')).rejects.toThrow(
        'Voice not found',
      );
    });
  });

  describe('forcedAlignment', () => {
    it('should align audio file and return SRT content', async () => {
      forcedAlignmentMock.mockResolvedValue({
        words: [
          { end: 1, start: 0, text: 'hello' },
          { end: 2, start: 1, text: 'world' },
        ],
      });
      (fs.createReadStream as ReturnType<typeof vi.fn>).mockReturnValue(
        'stream',
      );

      const srt = await service.forcedAlignment(
        '/tmp/audio.mp3',
        'hello world',
      );

      expect(forcedAlignmentMock).toHaveBeenCalledWith({
        file: 'stream',
        text: 'hello world',
      });
      expect(srt).toContain('hello');
      expect(srt).toContain('world');
      expect(srt).toContain('-->');
    });

    it('should propagate alignment errors', async () => {
      forcedAlignmentMock.mockRejectedValue(new Error('Alignment failed'));

      await expect(
        service.forcedAlignment('/tmp/audio.mp3', 'text'),
      ).rejects.toThrow('Alignment failed');
    });
  });
});
