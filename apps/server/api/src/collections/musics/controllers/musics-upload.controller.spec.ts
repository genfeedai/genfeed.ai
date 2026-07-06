vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MusicsUploadController } from '@api/collections/musics/controllers/musics-upload.controller';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation/upload-validation.pipe';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { ValidationConfigService } from '@libs/config/services/validation.config';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('MusicsUploadController', () => {
  let controller: MusicsUploadController;
  let filesClientService: FilesClientService;
  let sharedService: SharedService;

  const mockReq = {} as unknown as Request;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockFile: Express.Multer.File = {
    buffer: Buffer.from('fake audio data'),
    destination: '',
    encoding: '7bit',
    fieldname: 'file',
    filename: '',
    mimetype: 'audio/mpeg',
    originalname: 'test.mp3',
    path: '',
    size: 1024 * 1024, // 1MB
    stream: null,
  } as unknown as Express.Multer.File;

  const mockServices = {
    filesClientService: {
      uploadToS3: vi.fn().mockResolvedValue({
        duration: 120,
        height: null,
        size: 1024 * 1024,
        width: null,
      }),
    },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    metadataService: { patch: vi.fn() },
    musicsService: { patch: vi.fn() },
    sharedService: {
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: {
          _id: '507f1f77bcf86cd799439014',
          category: 'music',
        },
        metadataData: {
          _id: '507f1f77bcf86cd799439015',
        },
      }),
    },
    validationConfigService: {
      getAllowedAudioExtensions: vi.fn().mockReturnValue(['mp3']),
      getAllowedAudioMimeTypes: vi.fn().mockReturnValue(['audio/mpeg']),
      getMaxFileSize: vi.fn().mockReturnValue(100 * 1024 * 1024),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MusicsUploadController],
      providers: [
        {
          provide: FilesClientService,
          useValue: mockServices.filesClientService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
        { provide: MetadataService, useValue: mockServices.metadataService },
        { provide: MusicsService, useValue: mockServices.musicsService },
        { provide: SharedService, useValue: mockServices.sharedService },
        {
          provide: ValidationConfigService,
          useValue: mockServices.validationConfigService,
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MusicsUploadController>(MusicsUploadController);
    filesClientService = module.get<FilesClientService>(FilesClientService);
    sharedService = module.get<SharedService>(SharedService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createUpload', () => {
    it('should upload a music file successfully', async () => {
      const result = await controller.createUpload(mockReq, mockUser, mockFile);

      expect(sharedService.saveDocuments).toHaveBeenCalled();
      expect(filesClientService.uploadToS3).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when file is missing', () => {
      const pipe = new UploadValidationPipe({
        allowedExtensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'webm'],
        allowedMimeTypes: [
          'audio/mpeg',
          'audio/mp3',
          'audio/wav',
          'audio/aac',
          'audio/flac',
          'audio/ogg',
          'audio/webm',
        ],
        maxSizeBytes: 50 * 1024 * 1024,
      });
      expect(() =>
        pipe.transform(null as unknown as Express.Multer.File),
      ).toThrow(HttpException);
    });

    it('should throw error when file validation fails', () => {
      const pipe = new UploadValidationPipe({
        allowedExtensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'webm'],
        allowedMimeTypes: [
          'audio/mpeg',
          'audio/mp3',
          'audio/wav',
          'audio/aac',
          'audio/flac',
          'audio/ogg',
          'audio/webm',
        ],
        maxSizeBytes: 50 * 1024 * 1024,
      });
      const invalidFile = {
        ...mockFile,
        mimetype: 'invalid/type',
      } as unknown as Express.Multer.File;
      expect(() => pipe.transform(invalidFile)).toThrow(HttpException);
    });
  });
});
