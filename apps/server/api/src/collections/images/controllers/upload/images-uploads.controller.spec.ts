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

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();

  return {
    ...actual,
    createReadStream: vi.fn().mockReturnValue('mock-read-stream'),
    existsSync: vi.fn(actual.existsSync),
  };
});

import { createReadStream, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ImagesUploadsController } from '@api/collections/images/controllers/upload/images-uploads.controller';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { SolanaService } from '@api/services/integrations/solana/solana.service';
import { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
import { IngredientCategory } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ValidationConfigService } from '@libs/config/services/validation.config';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@server/shared/services/shared/shared.service';
import type { Request } from 'express';
import { of } from 'rxjs';

describe('ImagesUploadsController', () => {
  let controller: ImagesUploadsController;
  let filesClientService: FilesClientService;
  let sharedService: SharedService;

  const organizationId = testId('org');
  const brandId = testId('brand');
  const userId = testId('user');
  const ingredientId = testId('ingredient');

  const mockUser = {
    id: 'user_123',
    brandId,
    organizationId,
    userId,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/images/upload',
    params: {},
    query: {},
  } as unknown as Request;

  const mockIngredient = {
    _id: ingredientId,
    category: 'image',
    id: ingredientId,
    label: 'test-image.jpg',
    status: 'uploaded',
  };

  const mockServices = {
    filesClientService: {
      getPresignedUploadUrl: vi.fn(),
      putStreamToUrl: vi.fn(),
      uploadStreamToS3: vi.fn(),
      uploadToS3: vi.fn(),
    },
    httpService: { get: vi.fn() },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    presignedUploadService: {
      confirmUpload: vi.fn(),
      getPresignedUploadUrl: vi.fn(),
    },
    sharedService: { createMediaDocuments: vi.fn() },
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
      mockServices.sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
      });
      mockServices.filesClientService.uploadToS3.mockResolvedValue({
        url: 'https://s3.example.com/image.jpg',
      });

      const result = await controller.upload(mockRequest, mockUser, mockFile, {
        category: IngredientCategory.IMAGE,
      });

      expect(sharedService.createMediaDocuments).toHaveBeenCalled();
      expect(filesClientService.uploadStreamToS3).toHaveBeenCalledWith(
        mockIngredient.id,
        'images',
        expect.objectContaining({
          contentType: 'image/jpeg',
          data: mockFile.buffer,
        }),
      );
      expect(filesClientService.uploadToS3).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('streams a disk-backed file instead of buffering it as JSON', async () => {
      const mockFile = {
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
        path: path.join(
          tmpdir(),
          'genfeed-image-uploads',
          'nested',
          'disk.jpg',
        ),
        size: 2048,
      } as Express.Multer.File;

      mockServices.validationConfigService.getAllowedImageMimeTypes.mockReturnValue(
        ['image/jpeg', 'image/png'],
      );
      mockServices.validationConfigService.getAllowedImageExtensions.mockReturnValue(
        ['jpg', 'jpeg', 'png'],
      );
      mockServices.sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
      });
      mockServices.filesClientService.uploadStreamToS3.mockResolvedValue({
        url: 'https://s3.example.com/image.jpg',
      });

      await controller.upload(mockRequest, mockUser, mockFile, {
        category: IngredientCategory.IMAGE,
      });

      expect(filesClientService.uploadStreamToS3).toHaveBeenCalledWith(
        mockIngredient.id,
        'images',
        expect.objectContaining({
          contentType: 'image/jpeg',
          filename: 'test.jpg',
        }),
      );
      expect(filesClientService.uploadToS3).not.toHaveBeenCalled();
    });

    it.each([
      '/etc/passwd.jpg',
      path.join(tmpdir(), 'genfeed-image-uploads', 'nested\\outside.jpg'),
      path.join(
        tmpdir(),
        'genfeed-image-uploads',
        'nested',
        '%2e%2e',
        'outside.jpg',
      ),
      path.join(
        tmpdir(),
        'genfeed-image-uploads',
        'nested',
        '%252e%252e',
        'outside.jpg',
      ),
    ])(
      'rejects unsafe disk-backed upload path %s before reading it',
      async (filePath) => {
        const mockFile = {
          mimetype: 'image/jpeg',
          originalname: 'test.jpg',
          path: filePath,
          size: 2048,
        } as Express.Multer.File;

        mockServices.sharedService.createMediaDocuments.mockResolvedValue({
          ingredientData: mockIngredient,
        });

        await expect(
          controller.upload(mockRequest, mockUser, mockFile, {
            category: IngredientCategory.IMAGE,
          }),
        ).rejects.toThrow(BadRequestException);

        expect(createReadStream).not.toHaveBeenCalled();
        expect(existsSync).not.toHaveBeenCalled();
        expect(filesClientService.uploadStreamToS3).not.toHaveBeenCalled();
        expect(filesClientService.putStreamToUrl).not.toHaveBeenCalled();
      },
    );

    it('presigns large media and puts the stream instead of JSON base64', async () => {
      const mockFile = {
        buffer: Buffer.alloc(2 * 1024 * 1024),
        mimetype: 'video/mp4',
        originalname: 'large.mp4',
        size: 2 * 1024 * 1024,
      } as Express.Multer.File;

      mockServices.validationConfigService.getAllowedVideoMimeTypes.mockReturnValue(
        ['video/mp4'],
      );
      mockServices.validationConfigService.getAllowedVideoExtensions.mockReturnValue(
        ['mp4'],
      );
      mockServices.sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
      });
      mockServices.filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/videos/id',
        s3Key: 'ingredients/videos/id',
        uploadMethod: 'PUT',
        uploadUrl: 'https://s3.example.com/presigned',
      });
      mockServices.filesClientService.putStreamToUrl.mockResolvedValue(
        undefined,
      );
      mockServices.filesClientService.uploadToS3.mockResolvedValue({
        url: 'https://cdn.example.com/videos/id',
      });

      await controller.upload(mockRequest, mockUser, mockFile, {
        category: IngredientCategory.VIDEO,
      });

      expect(filesClientService.getPresignedUploadUrl).toHaveBeenCalledWith(
        mockIngredient.id,
        'videos',
        'video/mp4',
      );
      expect(filesClientService.putStreamToUrl).toHaveBeenCalledWith(
        'https://s3.example.com/presigned',
        mockFile.buffer,
        'video/mp4',
      );
      expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
        mockIngredient.id,
        'videos',
        { type: 'url', url: 'https://cdn.example.com/videos/id' },
      );
      expect(filesClientService.uploadStreamToS3).not.toHaveBeenCalled();
    });

    it('falls back to multipart when the presigned method is POST_JSON', async () => {
      const mockFile = {
        buffer: Buffer.alloc(2 * 1024 * 1024),
        mimetype: 'video/mp4',
        originalname: 'large.mp4',
        size: 2 * 1024 * 1024,
      } as Express.Multer.File;

      mockServices.validationConfigService.getAllowedVideoMimeTypes.mockReturnValue(
        ['video/mp4'],
      );
      mockServices.validationConfigService.getAllowedVideoExtensions.mockReturnValue(
        ['mp4'],
      );
      mockServices.sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
      });
      mockServices.filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: '/local/ingredients/videos/id',
        s3Key: 'ingredients/videos/id',
        uploadMethod: 'POST_JSON',
        uploadUrl: 'http://localhost:3012/v1/files/upload',
      });
      mockServices.filesClientService.uploadStreamToS3.mockResolvedValue({
        url: '/local/ingredients/videos/id',
      });

      await controller.upload(mockRequest, mockUser, mockFile, {
        category: IngredientCategory.VIDEO,
      });

      expect(filesClientService.putStreamToUrl).not.toHaveBeenCalled();
      expect(filesClientService.uploadStreamToS3).toHaveBeenCalled();
    });

    // Regression: this is the write path, so a raw `${category}s` did not just
    // read a missing key — it stored the object under `IMAGEs/`, where every
    // lowercase-folder reader would then fail to find it. The existing test
    // above passes a SCREAMING_SNAKE category but never asserts the folder.
    it('lower-cases a SCREAMING_SNAKE category for the S3 upload folder', async () => {
      const mockFile = {
        buffer: Buffer.from('test'),
        mimetype: 'video/mp4',
        originalname: 'test.mp4',
        size: 1024,
      } as Express.Multer.File;

      mockServices.validationConfigService.getAllowedVideoMimeTypes.mockReturnValue(
        ['video/mp4'],
      );
      mockServices.validationConfigService.getAllowedVideoExtensions.mockReturnValue(
        ['mp4'],
      );
      mockServices.sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
      });
      mockServices.filesClientService.uploadStreamToS3.mockResolvedValue({
        url: 'https://s3.example.com/video.mp4',
      });

      await controller.upload(mockRequest, mockUser, mockFile, {
        category: IngredientCategory.VIDEO,
      });

      expect(filesClientService.uploadStreamToS3).toHaveBeenCalledWith(
        mockIngredient.id,
        'videos',
        expect.anything(),
      );
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
      mockServices.sharedService.createMediaDocuments.mockResolvedValue({
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
        id: ingredientId,
        publicUrl: `https://cdn.example.com/images/${ingredientId}`,
        s3Key: `ingredients/images/${ingredientId}`,
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
