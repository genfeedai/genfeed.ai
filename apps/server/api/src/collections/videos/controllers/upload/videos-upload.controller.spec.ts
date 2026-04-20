import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosUploadController } from '@api/collections/videos/controllers/upload/videos-upload.controller';
import { ValidationConfigService } from '@api/config/services/validation.config';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

// Mock serializers to avoid real serialization in unit tests
vi.mock('@genfeedai/serializers', () => ({
  IngredientUploadSerializer: {
    opts: {},
    serialize: vi.fn((data) => data),
  },
}));

// Mock response util to return data directly
vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw { response, status: 400 };
  }),
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

describe('VideosUploadController', () => {
  let controller: VideosUploadController;
  let filesClientService: FilesClientService;
  let sharedService: SharedService;

  const mockReq = { originalUrl: '/videos/upload' } as unknown as Request;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockFile: Express.Multer.File = {
    buffer: Buffer.from('fake video data'),
    destination: '',
    encoding: '7bit',
    fieldname: 'file',
    filename: '',
    mimetype: 'video/mp4',
    originalname: 'test.mp4',
    path: '',
    size: 10 * 1024 * 1024, // 10MB
    stream: null,
  } as unknown as Express.Multer.File;

  const mockServices = {
    filesClientService: {
      uploadToS3: vi.fn().mockResolvedValue({
        duration: 60,
        height: 1080,
        size: 10 * 1024 * 1024,
        width: 1920,
      }),
    },
    ingredientsService: { patch: vi.fn() },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    metadataService: { patch: vi.fn() },
    sharedService: {
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: {
          _id: '507f1f77bcf86cd799439014',
          category: 'video',
        },
        metadataData: {
          _id: '507f1f77bcf86cd799439015',
        },
      }),
    },
    validationConfigService: {
      getAllowedVideoExtensions: vi.fn().mockReturnValue(['mp4']),
      getAllowedVideoMimeTypes: vi.fn().mockReturnValue(['video/mp4']),
      getMaxFileSize: vi.fn().mockReturnValue(100 * 1024 * 1024),
    },
    websocketService: {
      publishIngredientStatus: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosUploadController],
      providers: [
        {
          provide: FilesClientService,
          useValue: mockServices.filesClientService,
        },
        {
          provide: IngredientsService,
          useValue: mockServices.ingredientsService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
        { provide: MetadataService, useValue: mockServices.metadataService },
        { provide: SharedService, useValue: mockServices.sharedService },
        {
          provide: ValidationConfigService,
          useValue: mockServices.validationConfigService,
        },
        {
          provide: NotificationsPublisherService,
          useValue: mockServices.websocketService,
        },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VideosUploadController>(VideosUploadController);
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
    it('should upload a video file successfully', async () => {
      const result = await controller.createUpload(mockReq, mockUser, mockFile);

      expect(sharedService.saveDocuments).toHaveBeenCalled();
      expect(filesClientService.uploadToS3).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when file is missing', async () => {
      await expect(
        controller.createUpload(
          mockReq,
          mockUser,
          null as unknown as Express.Multer.File,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error when file validation fails', async () => {
      const invalidFile = {
        ...mockFile,
        mimetype: 'invalid/type',
      } as unknown as Express.Multer.File;

      await expect(
        controller.createUpload(mockReq, mockUser, invalidFile),
      ).rejects.toThrow(HttpException);
    });
  });
});
