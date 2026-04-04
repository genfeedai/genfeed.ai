vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw { response, status: 400 };
  }),
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { SpeechController } from '@api/collections/speech/controllers/speech.controller';
import { ValidationConfigService } from '@api/config/services/validation.config';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('SpeechController', () => {
  let controller: SpeechController;
  let loggerService: vi.Mocked<LoggerService>;
  let replicateService: vi.Mocked<ReplicateService>;

  const mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: new Types.ObjectId().toString(),
      isSuperAdmin: false,
      organization: new Types.ObjectId().toString(),
      user: new Types.ObjectId().toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockReq = {} as Request;

  const mockFile: Express.Multer.File = {
    buffer: Buffer.from('fake audio data'),
    destination: '',
    encoding: '7bit',
    fieldname: 'audio',
    filename: '',
    mimetype: 'audio/mpeg',
    originalname: 'test.mp3',
    path: '',
    size: 1024 * 1024, // 1MB
    stream: null,
  } as unknown as Express.Multer.File;

  const mockTranscriptionResult = {
    confidence: 0.95,
    duration: 10.5,
    language: 'en',
    text: 'This is a test transcription',
  };

  const mockReplicateService = {
    transcribeAudio: vi.fn().mockResolvedValue(mockTranscriptionResult),
  };

  const mockValidationConfigService = {
    getAllowedAudioExtensions: vi
      .fn()
      .mockReturnValue(['mp3', 'wav', 'm4a', 'mp4', 'webm', 'ogg']),
    getAllowedAudioMimeTypes: vi
      .fn()
      .mockReturnValue([
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/m4a',
        'audio/mp4',
        'audio/webm',
        'audio/ogg',
      ]),
    getMaxFileSize: vi.fn().mockReturnValue(100 * 1024 * 1024),
    isValidAudioExtension: vi.fn().mockReturnValue(true),
    isValidAudioMimeType: vi.fn().mockReturnValue(true),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpeechController],
      providers: [
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ValidationConfigService,
          useValue: mockValidationConfigService,
        },
        {
          provide: ReplicateService,
          useValue: mockReplicateService,
        },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<SpeechController>(SpeechController);
    loggerService = module.get(LoggerService);
    replicateService = module.get(ReplicateService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('transcribeAudio', () => {
    it('should transcribe audio file successfully', async () => {
      const result = await controller.transcribeAudio(
        mockReq,
        mockUser,
        mockFile,
        {},
      );

      expect(replicateService.transcribeAudio).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.confidence).toBe(mockTranscriptionResult.confidence);
      expect(result.text).toBe(mockTranscriptionResult.text);
    });

    it('should transcribe with custom language', async () => {
      const result = await controller.transcribeAudio(
        mockReq,
        mockUser,
        mockFile,
        { language: 'es' },
      );

      expect(result).toBeDefined();
    });

    it('should transcribe with prompt', async () => {
      const result = await controller.transcribeAudio(
        mockReq,
        mockUser,
        mockFile,
        { prompt: 'This is about technology' },
      );

      expect(result).toBeDefined();
    });

    it('should throw HttpException when transcription service fails', async () => {
      replicateService.transcribeAudio.mockRejectedValueOnce(
        new Error('Transcription error'),
      );

      await expect(
        controller.transcribeAudio(mockReq, mockUser, mockFile, {}),
      ).rejects.toThrow(HttpException);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });

    it('should throw HttpException when file is missing', async () => {
      await expect(
        controller.transcribeAudio(
          mockReq,
          mockUser,
          null as unknown as Express.Multer.File,
          {},
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('transcribeUrl', () => {
    it('should transcribe from URL successfully', async () => {
      const result = await controller.transcribeUrl(mockReq, mockUser, {
        url: 'https://example.com/audio.mp3',
      });

      expect(replicateService.transcribeAudio).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.text).toBe(mockTranscriptionResult.text);
    });

    it('should throw HttpException when URL is missing', async () => {
      await expect(
        controller.transcribeUrl(mockReq, mockUser, { url: '' }),
      ).rejects.toThrow(HttpException);
    });

    it('should transcribe from URL with language and prompt', async () => {
      const result = await controller.transcribeUrl(mockReq, mockUser, {
        language: 'fr',
        prompt: 'Technology discussion',
        url: 'https://example.com/audio.mp3',
      });

      expect(result).toBeDefined();
    });

    it('should handle transcription failure from URL', async () => {
      replicateService.transcribeAudio.mockRejectedValueOnce(
        new Error('URL transcription error'),
      );

      await expect(
        controller.transcribeUrl(mockReq, mockUser, {
          url: 'https://example.com/audio.mp3',
        }),
      ).rejects.toThrow(HttpException);

      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
