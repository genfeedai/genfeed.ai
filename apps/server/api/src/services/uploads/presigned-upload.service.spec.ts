import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

// Mock Clerk utilities
vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn((user) => ({
    organization: user.organizationId,
    user: user.id,
  })),
}));

describe('PresignedUploadService', () => {
  let service: PresignedUploadService;
  let filesClientService: vi.Mocked<FilesClientService>;
  let sharedService: vi.Mocked<SharedService>;
  let ingredientsService: vi.Mocked<IngredientsService>;
  let metadataService: vi.Mocked<MetadataService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockUserId = '507f1f77bcf86cd799439011';
  const mockOrganizationId = '507f1f77bcf86cd799439012';
  const mockIngredientId = '507f1f77bcf86cd799439013';
  const mockMetadataId = '507f1f77bcf86cd799439014';

  const mockUser = {
    emailAddresses: [{ emailAddress: 'test@example.com' }],
    id: mockUserId.toString(),
    organizationId: mockOrganizationId.toString(),
  } as unknown as User;

  const createIngredientEntity = (
    partial: Partial<IngredientEntity>,
  ): IngredientEntity =>
    ({
      _id: mockIngredientId,
      brand: 'test-object-id',
      category: IngredientCategory.IMAGE,
      extension: 'jpg',
      metadata: mockMetadataId,
      organization: mockOrganizationId,
      scope: AssetScope.USER,
      status: IngredientStatus.PROCESSING,
      user: mockUserId,
      ...partial,
    }) as unknown as IngredientEntity;

  const createIngredientDocument = (
    partial: Partial<IngredientDocument>,
  ): IngredientDocument =>
    ({
      _id: mockIngredientId,
      category: IngredientCategory.IMAGE,
      metadata: mockMetadataId,
      organization: mockOrganizationId,
      status: IngredientStatus.PROCESSING,
      user: mockUserId,
      ...partial,
    }) as unknown as IngredientDocument;

  const createMetadataEntity = (
    partial: Partial<MetadataEntity> = {},
  ): MetadataEntity =>
    ({
      _id: mockMetadataId,
      ...partial,
    }) as unknown as MetadataEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresignedUploadService,
        {
          provide: FilesClientService,
          useValue: {
            getPresignedDownloadUrl: vi.fn(),
            getPresignedUploadUrl: vi.fn(),
            uploadToS3: vi.fn(),
          },
        },
        {
          provide: SharedService,
          useValue: {
            saveDocuments: vi.fn(),
          },
        },
        {
          provide: IngredientsService,
          useValue: {
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: MetadataService,
          useValue: {
            patch: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PresignedUploadService>(PresignedUploadService);
    filesClientService = module.get(FilesClientService);
    sharedService = module.get(SharedService);
    ingredientsService = module.get(IngredientsService);
    metadataService = module.get(MetadataService);
    loggerService = module.get(LoggerService);

    (getPublicMetadata as vi.Mock).mockImplementation((user) => ({
      organization: user.organizationId,
      user: user.id,
    }));

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPresignedUploadUrl', () => {
    it('should generate presigned URL for image upload', async () => {
      const body = {
        category: IngredientCategory.IMAGE,
        contentType: 'image/jpeg',
        filename: 'test-image.jpg',
      };

      const mockIngredient = createIngredientEntity({
        category: IngredientCategory.IMAGE,
        extension: 'jpg',
      });

      sharedService.saveDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
        metadataData: createMetadataEntity(),
      });

      filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/images/507f1f77bcf86cd799439013',
        s3Key: 'ingredients/images/507f1f77bcf86cd799439013',
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload?signature=abc',
      });

      const result = await service.getPresignedUploadUrl(mockUser, body);

      expect(result).toEqual({
        _id: mockIngredientId.toString(),
        expiresIn: 3600,
        publicUrl: 'https://cdn.example.com/images/507f1f77bcf86cd799439013',
        s3Key: 'ingredients/images/507f1f77bcf86cd799439013',
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload?signature=abc',
      });

      expect(sharedService.saveDocuments).toHaveBeenCalledWith(mockUser, {
        category: 'image',
        extension: 'jpg',
        label: body.filename,
        scope: AssetScope.USER,
        status: IngredientStatus.PROCESSING,
      });

      expect(filesClientService.getPresignedUploadUrl).toHaveBeenCalledWith(
        mockIngredientId.toString(),
        'images',
        body.contentType,
        3600,
      );
    });

    it('should generate presigned URL for video upload', async () => {
      const body = {
        category: IngredientCategory.VIDEO,
        contentType: 'video/mp4',
        filename: 'test-video.mp4',
      };

      const mockIngredient = createIngredientEntity({
        category: IngredientCategory.VIDEO,
        extension: 'mp4',
      });

      sharedService.saveDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
        metadataData: createMetadataEntity(),
      });

      filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/videos/507f1f77bcf86cd799439013',
        s3Key: 'ingredients/videos/507f1f77bcf86cd799439013',
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload?signature=xyz',
      });

      const result = await service.getPresignedUploadUrl(mockUser, body);

      expect(result.s3Key).toBe('ingredients/videos/507f1f77bcf86cd799439013');
      expect(filesClientService.getPresignedUploadUrl).toHaveBeenCalledWith(
        mockIngredientId.toString(),
        'videos',
        body.contentType,
        3600,
      );
    });

    it('should default to image category when not specified', async () => {
      const body = {
        contentType: 'image/png',
        filename: 'test.png',
      };

      const mockIngredient = createIngredientEntity({
        category: IngredientCategory.IMAGE,
        extension: 'png',
      });

      sharedService.saveDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
        metadataData: createMetadataEntity(),
      });

      filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/images/test',
        s3Key: 'ingredients/images/test',
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
      });

      await service.getPresignedUploadUrl(mockUser, body);

      expect(sharedService.saveDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          category: 'image',
        }),
      );
    });

    it('should extract file extension correctly', async () => {
      const body = {
        category: IngredientCategory.IMAGE,
        contentType: 'application/pdf',
        filename: 'document.pdf',
      };

      const mockIngredient = createIngredientEntity({
        category: IngredientCategory.IMAGE,
        extension: 'pdf',
      });

      sharedService.saveDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
        metadataData: createMetadataEntity(),
      });

      filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/images/test',
        s3Key: 'ingredients/images/test',
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
      });

      await service.getPresignedUploadUrl(mockUser, body);

      expect(sharedService.saveDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          extension: 'pdf',
        }),
      );
    });

    it('should default to jpg when no extension found', async () => {
      const body = {
        contentType: 'image/jpeg',
        filename: 'noextension',
      };

      const mockIngredient = createIngredientEntity({
        category: IngredientCategory.IMAGE,
        extension: 'jpg',
      });

      sharedService.saveDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
        metadataData: createMetadataEntity(),
      });

      filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/images/test',
        s3Key: 'ingredients/images/test',
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
      });

      await service.getPresignedUploadUrl(mockUser, body);

      expect(sharedService.saveDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          extension: 'jpg',
        }),
      );
    });
  });

  describe('confirmUpload', () => {
    it('should confirm upload and extract metadata', async () => {
      const ingredientId = mockIngredientId.toString();

      const mockIngredient = createIngredientDocument({
        category: IngredientCategory.IMAGE,
        metadata: mockMetadataId,
      });

      ingredientsService.findOne.mockResolvedValue(mockIngredient);

      filesClientService.getPresignedDownloadUrl.mockResolvedValue(
        'https://s3.amazonaws.com/bucket/images/test?signature=abc',
      );

      filesClientService.uploadToS3.mockResolvedValue({
        duration: undefined,
        hasAudio: false,
        height: 1080,
        size: 2048576,
        width: 1920,
      });

      ingredientsService.patch.mockResolvedValue(
        createIngredientDocument({
          ...mockIngredient,
          status: IngredientStatus.UPLOADED,
        }),
      );

      metadataService.patch.mockResolvedValue(createMetadataEntity());

      const result = await service.confirmUpload(mockUser, ingredientId);

      expect(result.status).toBe(IngredientStatus.UPLOADED);

      expect(ingredientsService.findOne).toHaveBeenCalledWith(
        {
          _id: mockIngredientId,
          status: 'processing',
          user: mockUserId,
        },
        [{ path: 'metadata' }],
      );

      expect(metadataService.patch).toHaveBeenCalledWith(mockMetadataId, {
        duration: undefined,
        hasAudio: false,
        height: 1080,
        size: 2048576,
        width: 1920,
      });

      expect(ingredientsService.patch).toHaveBeenCalledWith(ingredientId, {
        status: IngredientStatus.UPLOADED,
      });
    });

    it('should throw NOT_FOUND when ingredient not found', async () => {
      const ingredientId = mockIngredientId.toString();

      ingredientsService.findOne.mockResolvedValue(null);

      await expect(
        service.confirmUpload(mockUser, ingredientId),
      ).rejects.toThrow(HttpException);

      await expect(
        service.confirmUpload(mockUser, ingredientId),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            detail: 'No pending upload found with this ID',
            title: 'Upload not found',
          }),
          status: HttpStatus.NOT_FOUND,
        }),
      );
    });

    it('should continue if metadata extraction fails', async () => {
      const ingredientId = mockIngredientId.toString();

      const mockIngredient = createIngredientDocument({
        category: IngredientCategory.VIDEO,
        metadata: mockMetadataId,
      });

      ingredientsService.findOne.mockResolvedValue(mockIngredient);
      filesClientService.getPresignedDownloadUrl.mockResolvedValue(
        'https://s3.amazonaws.com/bucket/videos/test',
      );
      filesClientService.uploadToS3.mockRejectedValue(
        new Error('Metadata extraction failed'),
      );

      ingredientsService.patch.mockResolvedValue(
        createIngredientDocument({
          ...mockIngredient,
          status: IngredientStatus.UPLOADED,
        }),
      );

      const result = await service.confirmUpload(mockUser, ingredientId);

      expect(result.status).toBe(IngredientStatus.UPLOADED);
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to extract metadata'),
        undefined,
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Metadata extraction failed',
          }),
        }),
      );
    });

    it('should handle video category correctly', async () => {
      const ingredientId = mockIngredientId.toString();

      const mockIngredient = createIngredientDocument({
        category: IngredientCategory.VIDEO,
        metadata: mockMetadataId,
      });

      ingredientsService.findOne.mockResolvedValue(mockIngredient);
      filesClientService.getPresignedDownloadUrl.mockResolvedValue(
        'https://s3.amazonaws.com/bucket/videos/test',
      );
      filesClientService.uploadToS3.mockResolvedValue({
        duration: 10.5,
        hasAudio: true,
        height: 1080,
        size: 5242880,
        width: 1920,
      });

      ingredientsService.patch.mockResolvedValue(
        createIngredientDocument({
          ...mockIngredient,
          status: IngredientStatus.UPLOADED,
        }),
      );

      await service.confirmUpload(mockUser, ingredientId);

      expect(filesClientService.getPresignedDownloadUrl).toHaveBeenCalledWith(
        ingredientId,
        'videos',
        300,
      );

      expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
        ingredientId,
        'videos',
        expect.objectContaining({
          type: 'url',
        }),
      );
    });

    it('should handle metadata as ObjectId', async () => {
      const ingredientId = mockIngredientId.toString();

      const mockIngredient = createIngredientDocument({
        category: IngredientCategory.IMAGE,
        metadata: { _id: mockMetadataId } as never,
      });

      ingredientsService.findOne.mockResolvedValue(mockIngredient);
      filesClientService.getPresignedDownloadUrl.mockResolvedValue(
        'https://s3.amazonaws.com/test',
      );
      filesClientService.uploadToS3.mockResolvedValue({
        height: 600,
        size: 1024000,
        width: 800,
      });
      ingredientsService.patch.mockResolvedValue(
        createIngredientDocument({
          ...mockIngredient,
          status: IngredientStatus.UPLOADED,
        }),
      );
      metadataService.patch.mockResolvedValue(createMetadataEntity());

      await service.confirmUpload(mockUser, ingredientId);

      expect(metadataService.patch).toHaveBeenCalledWith(
        mockMetadataId,
        expect.any(Object),
      );
    });
  });
});
