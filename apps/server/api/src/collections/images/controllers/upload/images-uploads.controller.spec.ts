vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw { response, status: 400 };
  }),
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { ImagesUploadsController } from '@api/collections/images/controllers/upload/images-uploads.controller';
import { ValidationConfigService } from '@api/config/services/validation.config';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { SolanaService } from '@api/services/integrations/solana/solana.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import { IngredientCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { of } from 'rxjs';

describe('ImagesUploadsController', () => {
  let controller: ImagesUploadsController;
  let filesClientService: FilesClientService;
  let sharedService: SharedService;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/images/upload',
    params: {},
    query: {},
  } as unknown as Request;

  const mockIngredient = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
    category: 'image',
    id: '507f1f77bcf86cd799439014',
    label: 'test-image.jpg',
    status: 'uploaded',
  };

  const mockServices = {
    filesClientService: { uploadToS3: vi.fn() },
    httpService: { get: vi.fn() },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    presignedUploadService: {
      confirmUpload: vi.fn(),
      getPresignedUploadUrl: vi.fn(),
    },
    sharedService: { saveDocuments: vi.fn() },
    solanaService: { getNft: vi.fn() },
    validationConfigService: {
      getAllowedAudioExtensions: vi.fn(),
      getAllowedAudioMimeTypes: vi.fn(),
      getAllowedImageExtensions: vi
        .fn()
        .mockReturnValue(['jpg', 'jpeg', 'png']),
      getAllowedImageMimeTypes: vi
        .fn()
        .mockReturnValue(['image/jpeg', 'image/png']),
      getAllowedVideoExtensions: vi.fn(),
      getAllowedVideoMimeTypes: vi.fn(),
      getMaxFileSize: vi.fn().mockReturnValue(50 * 1024 * 1024),
    },
    websocketService: { publishVideoComplete: vi.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImagesUploadsController],
      providers: [
        {
          provide: FilesClientService,
          useValue: mockServices.filesClientService,
        },
        { provide: HttpService, useValue: mockServices.httpService },
        { provide: LoggerService, useValue: mockServices.loggerService },
        {
          provide: PresignedUploadService,
          useValue: mockServices.presignedUploadService,
        },
        { provide: SharedService, useValue: mockServices.sharedService },
        { provide: SolanaService, useValue: mockServices.solanaService },
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
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<ImagesUploadsController>(ImagesUploadsController);
    filesClientService = module.get<FilesClientService>(FilesClientService);
    sharedService = module.get<SharedService>(SharedService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('upload', () => {
    it('should upload an image file', async () => {
      const mockFile = {
        buffer: Buffer.from('test'),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
        size: 1024,
      } as Express.Multer.File;

      mockServices.validationConfigService.getAllowedImageMimeTypes.mockReturnValue(
        ['image/jpeg', 'image/png'],
      );
      mockServices.validationConfigService.getAllowedImageExtensions.mockReturnValue(
        ['jpg', 'jpeg', 'png'],
      );
      mockServices.sharedService.saveDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
      });
      mockServices.filesClientService.uploadToS3.mockResolvedValue({
        url: 'https://s3.example.com/image.jpg',
      });

      const result = await controller.upload(mockRequest, mockUser, mockFile, {
        category: IngredientCategory.IMAGE,
      });

      expect(sharedService.saveDocuments).toHaveBeenCalled();
      expect(filesClientService.uploadToS3).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should reject invalid file uploads', async () => {
      mockServices.validationConfigService.getAllowedImageMimeTypes.mockReturnValue(
        ['image/jpeg'],
      );
      mockServices.validationConfigService.getAllowedImageExtensions.mockReturnValue(
        ['jpg'],
      );

      await expect(
        controller.upload(
          mockRequest,
          mockUser,
          null as unknown as Express.Multer.File,
          { category: IngredientCategory.IMAGE },
        ),
      ).rejects.toThrow();
    });
  });

  describe('uploadNFT', () => {
    it('should upload an NFT image', async () => {
      const nftAddress = 'solana-nft-address-123';
      const mockNft = {
        image: 'https://example.com/nft.png',
        name: 'Cool NFT',
      };

      mockServices.solanaService.getNft.mockResolvedValue(mockNft);
      mockServices.httpService.get.mockReturnValue(
        of({
          data: Buffer.from('image-data'),
          headers: { 'content-type': 'image/png' },
        }),
      );
      mockServices.sharedService.saveDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
      });
      mockServices.filesClientService.uploadToS3.mockResolvedValue({
        url: 'https://s3.example.com/nft.png',
      });

      const result = await controller.uploadNFT(mockRequest, mockUser, {
        address: nftAddress,
      });

      expect(result).toBeDefined();
    });

    it('should reject non-image NFTs', async () => {
      const nftAddress = 'solana-nft-address-123';
      const mockNft = {
        image: 'https://example.com/nft.json',
        name: 'Cool NFT',
      };

      mockServices.solanaService.getNft.mockResolvedValue(mockNft);
      mockServices.httpService.get.mockReturnValue(
        of({
          data: Buffer.from('json-data'),
          headers: { 'content-type': 'application/json' },
        }),
      );

      await expect(
        controller.uploadNFT(mockRequest, mockUser, { address: nftAddress }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('generatePresignedUrl', () => {
    it('should generate presigned URL for upload', async () => {
      const body = {
        category: IngredientCategory.IMAGE,
        contentType: 'image/jpeg',
        filename: 'test.jpg',
      };

      const mockResult = {
        expiresIn: 3600,
        ingredientId: '507f1f77bcf86cd799439014',
        uploadUrl: 'https://s3.example.com/presigned-url',
      };

      mockServices.presignedUploadService.getPresignedUploadUrl.mockResolvedValue(
        mockResult,
      );

      const result = await controller.generatePresignedUrl(
        mockRequest,
        mockUser,
        body,
      );

      expect(result).toBeDefined();
    });
  });

  describe('confirmUpload', () => {
    it('should confirm completed upload', async () => {
      const ingredientId = '507f1f77bcf86cd799439014';

      mockServices.presignedUploadService.confirmUpload.mockResolvedValue(
        mockIngredient,
      );

      const result = await controller.confirmUpload(
        mockRequest,
        mockUser,
        ingredientId,
      );

      expect(result).toBeDefined();
    });
  });
});
