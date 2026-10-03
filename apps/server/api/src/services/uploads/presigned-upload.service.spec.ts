import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isSelfHostedDeployment: () => false,
}));

// Mock legacy auth provider utilities

describe('PresignedUploadService', () => {
  let service: PresignedUploadService;
  let filesClientService: vi.Mocked<FilesClientService>;
  let sharedService: vi.Mocked<SharedService>;
  let ingredientsService: vi.Mocked<IngredientsService>;
  let metadataService: vi.Mocked<MetadataService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockUserId = testId('user');
  const mockOrganizationId = testId('org');
  const mockIngredientId = testId('ingredient');
  const mockMetadataId = testId('metadata');

  const mockUser = {
    emailAddresses: [{ emailAddress: 'test@example.com' }],
    id: mockUserId.toString(),
    organizationId: mockOrganizationId.toString(),
  } as unknown as User;

  const createIngredientEntity = (
    partial: Partial<IngredientEntity>,
  ): IngredientEntity =>
    ({
      id: mockIngredientId,
      brandId: 'test-object-id',
      category: IngredientCategory.IMAGE,
      metadataId: mockMetadataId,
      organizationId: mockOrganizationId,
      scope: AssetScope.USER,
      status: IngredientStatus.PROCESSING,
      userId: mockUserId,
      ...partial,
    }) as unknown as IngredientEntity;

  const createIngredientDocument = (
    partial: Partial<IngredientDocument>,
  ): IngredientDocument =>
    ({
      id: mockIngredientId,
      category: IngredientCategory.IMAGE,
      metadataId: mockMetadataId,
      organizationId: mockOrganizationId,
      status: IngredientStatus.PROCESSING,
      userId: mockUserId,
      s3Key: `ingredients/${partial.category === IngredientCategory.VIDEO ? 'videos' : 'images'}/${mockIngredientId}`,
      ...partial,
    }) as unknown as IngredientDocument;

  const createMetadataEntity = (
    partial: Partial<MetadataEntity> = {},
  ): MetadataEntity =>
    ({
      id: mockMetadataId,
      ...partial,
    }) as unknown as MetadataEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresignedUploadService,
        {
          provide: ConfigService,
          useValue: { isAuthorizedMediaDeliveryEnabled: true },
        },
        {
          provide: FilesClientService,
          useValue: {
            deleteStoredObject: vi.fn().mockResolvedValue(undefined),
            getPresignedDownloadUrlForObjectKey: vi.fn(),
            getPresignedUploadUrl: vi.fn(),
            uploadToExistingObject: vi.fn(),
          },
        },
        {
          provide: SharedService,
          useValue: {
            createMediaDocuments: vi.fn(),
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
        sizeBytes: 2048,
      };

      const mockIngredient = createIngredientEntity({
        category: IngredientCategory.IMAGE,
      });

      sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
        metadataData: createMetadataEntity(),
      });

      filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: `https://cdn.example.com/images/${mockIngredientId}`,
        s3Key: `ingredients/images/${mockIngredientId}`,
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload?signature=abc',
      });

      const result = await service.getPresignedUploadUrl(mockUser, body);

      expect(ingredientsService.patch).toHaveBeenCalledWith(mockIngredientId, {
        s3Key: `ingredients/images/${mockIngredientId}`,
      });

      expect(result).toEqual({
        expiresIn: 3600,
        id: mockIngredientId.toString(),
        publicUrl: `https://cdn.example.com/images/${mockIngredientId}`,
        s3Key: `ingredients/images/${mockIngredientId}`,
        uploadMethod: 'PUT',
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload?signature=abc',
      });

      expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
        mockUser,
        {
          category: CategoryPrismaUtil.toIngredientCategory(
            IngredientCategory.IMAGE,
          ),
          extension: 'JPEG',
          label: body.filename,
          scope: AssetScope.USER,
          status: IngredientStatus.PROCESSING,
        },
      );

      expect(filesClientService.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        'images',
        body.contentType,
        3600,
        2048,
      );
    });

    it.each(['PUT', 'POST_JSON'] as const)(
      'should persist the exact files-service key before returning a %s grant',
      async (uploadMethod) => {
        sharedService.createMediaDocuments.mockResolvedValue({
          ingredientData: createIngredientEntity({}),
          metadataData: createMetadataEntity(),
        });
        const s3Key = 'ingredients/images/server-selected-key';
        filesClientService.getPresignedUploadUrl.mockResolvedValue({
          publicUrl: 'https://cdn.example.com/image',
          s3Key,
          uploadMethod,
          uploadUrl: 'https://storage.example.com/upload?signature=abc',
        });
        let finishPersistence: (() => void) | undefined;
        ingredientsService.patch.mockImplementation(
          () =>
            new Promise((resolve) => {
              finishPersistence = () =>
                resolve(createIngredientDocument({ s3Key }));
            }),
        );
        let returned = false;
        const grant = service
          .getPresignedUploadUrl(mockUser, {
            contentType: 'image/jpeg',
            filename: 'image.jpg',
          })
          .then((result) => {
            returned = true;
            return result;
          });
        await vi.waitFor(() => expect(finishPersistence).toBeDefined());
        expect(returned).toBe(false);
        expect(ingredientsService.patch).toHaveBeenCalledWith(
          mockIngredientId,
          { s3Key },
        );
        finishPersistence?.();
        await expect(grant).resolves.toEqual(
          expect.objectContaining({ s3Key, uploadMethod }),
        );
      },
    );

    it('should reject the grant when key persistence fails', async () => {
      sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: createIngredientEntity({}),
        metadataData: createMetadataEntity(),
      });
      filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/image',
        s3Key: 'ingredients/images/server-selected-key',
        uploadUrl: 'https://storage.example.com/upload',
      });
      ingredientsService.patch.mockRejectedValue(
        new Error('Persistence failed'),
      );
      await expect(
        service.getPresignedUploadUrl(mockUser, {
          contentType: 'image/jpeg',
          filename: 'image.jpg',
        }),
      ).rejects.toThrow('Persistence failed');
    });

    it.each(['', '   ', undefined])(
      'should reject a missing files-service key (%s)',
      async (s3Key) => {
        sharedService.createMediaDocuments.mockResolvedValue({
          ingredientData: createIngredientEntity({}),
          metadataData: createMetadataEntity(),
        });
        filesClientService.getPresignedUploadUrl.mockResolvedValue({
          publicUrl: 'https://cdn.example.com/image',
          s3Key,
          uploadUrl: 'https://storage.example.com/upload',
        } as Awaited<ReturnType<FilesClientService['getPresignedUploadUrl']>>);
        await expect(
          service.getPresignedUploadUrl(mockUser, {
            contentType: 'image/jpeg',
            filename: 'image.jpg',
          }),
        ).rejects.toThrow('Files service returned no storage key');
        expect(ingredientsService.patch).not.toHaveBeenCalled();
      },
    );

    it('should generate presigned URL for video upload', async () => {
      const body = {
        category: IngredientCategory.VIDEO,
        contentType: 'video/mp4',
        filename: 'test-video.mp4',
      };

      const mockIngredient = createIngredientEntity({
        category: IngredientCategory.VIDEO,
      });

      sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
        metadataData: createMetadataEntity(),
      });

      filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: `https://cdn.example.com/videos/${mockIngredientId}`,
        s3Key: `ingredients/videos/${mockIngredientId}`,
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload?signature=xyz',
      });

      const result = await service.getPresignedUploadUrl(mockUser, body);

      expect(result.s3Key).toBe(`ingredients/videos/${mockIngredientId}`);
      expect(filesClientService.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        'videos',
        body.contentType,
        3600,
        undefined,
      );
    });

    it('should default to image category when not specified', async () => {
      const body = {
        contentType: 'image/png',
        filename: 'test.png',
      };

      const mockIngredient = createIngredientEntity({
        category: IngredientCategory.IMAGE,
      });

      sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
        metadataData: createMetadataEntity(),
      });

      filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/images/test',
        s3Key: 'ingredients/images/test',
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
      });

      await service.getPresignedUploadUrl(mockUser, body);

      expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          category: CategoryPrismaUtil.toIngredientCategory(
            IngredientCategory.IMAGE,
          ),
        }),
      );
    });

    it('should extract the filename extension for allowed types without a label', async () => {
      sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: createIngredientEntity({}),
        metadataData: createMetadataEntity(),
      });
      filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/images/test',
        s3Key: 'ingredients/images/test',
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
      });

      await service.getPresignedUploadUrl(mockUser, {
        category: IngredientCategory.IMAGE,
        contentType: 'image/heic',
        filename: 'phone.heic',
      });

      expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({ extension: 'heic' }),
      );
    });

    it.each([
      ['application/pdf', IngredientCategory.IMAGE],
      ['application/octet-stream', IngredientCategory.IMAGE],
      ['text/html', IngredientCategory.IMAGE],
      ['image/svg+xml', IngredientCategory.IMAGE],
      ['image/png', IngredientCategory.VIDEO],
      ['video/mp4', IngredientCategory.MUSIC],
      ['', IngredientCategory.IMAGE],
    ])(
      'should reject %s for %s before creating any record',
      async (contentType, category) => {
        await expect(
          service.getPresignedUploadUrl(mockUser, {
            category,
            contentType,
            filename: 'file.bin',
            sizeBytes: 1024,
          }),
        ).rejects.toMatchObject({ status: HttpStatus.UNSUPPORTED_MEDIA_TYPE });

        expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
        expect(filesClientService.getPresignedUploadUrl).not.toHaveBeenCalled();
      },
    );

    it('should reject a category that cannot be uploaded directly', async () => {
      await expect(
        service.getPresignedUploadUrl(mockUser, {
          category: IngredientCategory.TEXT,
          contentType: 'text/plain',
          filename: 'a.txt',
        }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
    });

    it('should reject an oversized declared upload before signing', async () => {
      await expect(
        service.getPresignedUploadUrl(mockUser, {
          category: IngredientCategory.IMAGE,
          contentType: 'image/png',
          filename: 'huge.png',
          sizeBytes: 51 * 1024 * 1024,
        }),
      ).rejects.toMatchObject({ status: HttpStatus.PAYLOAD_TOO_LARGE });

      expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
      expect(filesClientService.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('should let trusted callers raise the cap', async () => {
      sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: createIngredientEntity({}),
        metadataData: createMetadataEntity(),
      });
      filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/v',
        s3Key: 'ingredients/videos/v',
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
      });

      await service.getPresignedUploadUrl(
        mockUser,
        {
          category: IngredientCategory.VIDEO,
          contentType: 'video/mp4',
          filename: 'big.mp4',
          sizeBytes: 2 * 1024 * 1024 * 1024,
        },
        { maxBytes: 10 * 1024 * 1024 * 1024 },
      );

      expect(filesClientService.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.any(String),
        'videos',
        'video/mp4',
        3600,
        2 * 1024 * 1024 * 1024,
      );
    });

    it('should default to jpg when no extension found', async () => {
      const body = {
        contentType: 'image/jpeg',
        filename: 'noextension',
      };

      const mockIngredient = createIngredientEntity({
        category: IngredientCategory.IMAGE,
      });

      sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: mockIngredient,
        metadataData: createMetadataEntity(),
      });

      filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/images/test',
        s3Key: 'ingredients/images/test',
        uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
      });

      await service.getPresignedUploadUrl(mockUser, body);

      expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          extension: 'JPEG',
        }),
      );
    });
  });

  describe('confirmUpload', () => {
    it('should confirm upload and extract metadata', async () => {
      const ingredientId = mockIngredientId.toString();

      const mockIngredient = createIngredientDocument({
        category: IngredientCategory.IMAGE,
      });

      ingredientsService.findOne.mockResolvedValue(mockIngredient);

      filesClientService.getPresignedDownloadUrlForObjectKey.mockResolvedValue(
        'https://s3.amazonaws.com/bucket/images/test?signature=abc',
      );

      filesClientService.uploadToExistingObject.mockResolvedValue({
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
          id: mockIngredientId,
          isDeleted: false,
          organizationId: mockOrganizationId,
          status: IngredientStatus.PROCESSING,
          userId: mockUserId,
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
        s3Key: `ingredients/images/${ingredientId}`,
        status: IngredientStatus.UPLOADED,
      });
    });

    it('should keep the existing key when reprocessing returns another key', async () => {
      const s3Key = 'ingredients/images/existing-key';
      ingredientsService.findOne.mockResolvedValue(
        createIngredientDocument({ s3Key }),
      );
      filesClientService.uploadToExistingObject.mockResolvedValue({
        height: 10,
        s3Key: 'ingredients/images/reprocessed-key',
        width: 10,
      });
      await service.confirmUpload(mockUser, mockIngredientId);
      expect(ingredientsService.patch).toHaveBeenCalledWith(mockIngredientId, {
        s3Key,
        status: IngredientStatus.UPLOADED,
      });
    });

    it('refuses keyless pending uploads without reconstructing a key from the ingredient ID', async () => {
      ingredientsService.findOne.mockResolvedValue(
        createIngredientDocument({ s3Key: undefined }),
      );
      await expect(
        service.confirmUpload(mockUser, mockIngredientId),
      ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
      expect(
        filesClientService.getPresignedDownloadUrlForObjectKey,
      ).not.toHaveBeenCalled();
      expect(filesClientService.uploadToExistingObject).not.toHaveBeenCalled();
    });

    it('reads and processes the stored random object while patching the canonical ingredient', async () => {
      const s3Key = 'ingredients/images/unrelated-random-token';
      ingredientsService.findOne.mockResolvedValue(
        createIngredientDocument({ s3Key }),
      );
      filesClientService.getPresignedDownloadUrlForObjectKey.mockResolvedValue(
        'https://s3.test/random?signature=grant',
      );
      filesClientService.uploadToExistingObject.mockResolvedValue({
        height: 10,
        width: 10,
      });
      await service.confirmUpload(mockUser, mockIngredientId);
      expect(
        filesClientService.getPresignedDownloadUrlForObjectKey,
      ).toHaveBeenCalledWith(s3Key);
      expect(filesClientService.uploadToExistingObject).toHaveBeenCalledWith(
        s3Key,
        'images',
        { type: 'url', url: 'https://s3.test/random?signature=grant' },
      );
      expect(ingredientsService.patch).toHaveBeenCalledWith(mockIngredientId, {
        s3Key,
        status: IngredientStatus.UPLOADED,
      });
    });

    it.each(['download', 'upload'])(
      'should fail the ingredient and delete the object when %s fails',
      async (stage) => {
        ingredientsService.findOne.mockResolvedValue(
          createIngredientDocument({ category: IngredientCategory.VIDEO }),
        );
        if (stage === 'download') {
          filesClientService.getPresignedDownloadUrlForObjectKey.mockRejectedValue(
            new Error('Download failed'),
          );
        } else {
          filesClientService.uploadToExistingObject.mockRejectedValue(
            new Error('Upload failed'),
          );
        }

        await expect(
          service.confirmUpload(mockUser, mockIngredientId),
        ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });

        expect(ingredientsService.patch).toHaveBeenCalledTimes(1);
        expect(ingredientsService.patch).toHaveBeenCalledWith(
          mockIngredientId,
          { status: IngredientStatus.FAILED },
        );
        expect(ingredientsService.patch).not.toHaveBeenCalledWith(
          mockIngredientId,
          expect.objectContaining({ status: IngredientStatus.UPLOADED }),
        );
        expect(filesClientService.deleteStoredObject).toHaveBeenCalledWith(
          `ingredients/videos/${mockIngredientId}`,
        );
        expect(metadataService.patch).not.toHaveBeenCalled();
        expect(loggerService.error).toHaveBeenCalledWith(
          expect.stringContaining('failed to extract metadata'),
          undefined,
          expect.any(Object),
        );
      },
    );

    it.each([
      ['empty result', undefined],
      ['zero dimensions', { height: 0, size: 10, width: 0 }],
    ])(
      'should reject an image with %s instead of marking it uploaded',
      async (_label, uploadMeta) => {
        ingredientsService.findOne.mockResolvedValue(
          createIngredientDocument({ category: IngredientCategory.IMAGE }),
        );
        filesClientService.uploadToExistingObject.mockResolvedValue(
          uploadMeta as never,
        );

        await expect(
          service.confirmUpload(mockUser, mockIngredientId),
        ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });

        expect(ingredientsService.patch).toHaveBeenCalledWith(
          mockIngredientId,
          {
            status: IngredientStatus.FAILED,
          },
        );
        expect(metadataService.patch).not.toHaveBeenCalled();
      },
    );

    it('should surface the processing error even when storage cleanup fails', async () => {
      ingredientsService.findOne.mockResolvedValue(
        createIngredientDocument({}),
      );
      filesClientService.uploadToExistingObject.mockRejectedValue(
        new Error('corrupt'),
      );
      filesClientService.deleteStoredObject.mockRejectedValue(
        new Error('storage down'),
      );

      await expect(
        service.confirmUpload(mockUser, mockIngredientId),
      ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    });

    it('should reject an upload larger than the category cap', async () => {
      ingredientsService.findOne.mockResolvedValue(
        createIngredientDocument({ category: IngredientCategory.IMAGE }),
      );
      filesClientService.uploadToExistingObject.mockResolvedValue({
        height: 100,
        size: 51 * 1024 * 1024,
        width: 100,
      });

      await expect(
        service.confirmUpload(mockUser, mockIngredientId),
      ).rejects.toMatchObject({ status: HttpStatus.PAYLOAD_TOO_LARGE });

      expect(ingredientsService.patch).toHaveBeenCalledWith(mockIngredientId, {
        status: IngredientStatus.FAILED,
      });
      expect(filesClientService.deleteStoredObject).toHaveBeenCalled();
    });

    it('should honor a raised cap from trusted callers', async () => {
      const ingredient = createIngredientDocument({
        category: IngredientCategory.VIDEO,
      });
      ingredientsService.findOne.mockResolvedValue(ingredient);
      filesClientService.uploadToExistingObject.mockResolvedValue({
        height: 1080,
        size: 500 * 1024 * 1024,
        width: 1920,
      });
      ingredientsService.patch.mockResolvedValue(
        createIngredientDocument({ status: IngredientStatus.UPLOADED }),
      );

      await service.confirmUpload(mockUser, mockIngredientId, {
        maxBytes: 10 * 1024 * 1024 * 1024,
      });

      expect(ingredientsService.patch).toHaveBeenCalledWith(
        mockIngredientId,
        expect.objectContaining({ status: IngredientStatus.UPLOADED }),
      );
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

    it('should handle video category correctly', async () => {
      const ingredientId = mockIngredientId.toString();

      const mockIngredient = createIngredientDocument({
        category: IngredientCategory.VIDEO,
      });

      ingredientsService.findOne.mockResolvedValue(mockIngredient);
      filesClientService.getPresignedDownloadUrlForObjectKey.mockResolvedValue(
        'https://s3.amazonaws.com/bucket/videos/test',
      );
      filesClientService.uploadToExistingObject.mockResolvedValue({
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

      expect(
        filesClientService.getPresignedDownloadUrlForObjectKey,
      ).toHaveBeenCalledWith(`ingredients/videos/${ingredientId}`);

      expect(filesClientService.uploadToExistingObject).toHaveBeenCalledWith(
        `ingredients/videos/${ingredientId}`,
        'videos',
        expect.objectContaining({
          type: 'url',
        }),
      );
    });

    it('should handle a populated metadata relation', async () => {
      const ingredientId = mockIngredientId.toString();

      const mockIngredient = createIngredientDocument({
        category: IngredientCategory.IMAGE,
        metadata: { id: mockMetadataId } as never,
      });

      ingredientsService.findOne.mockResolvedValue(mockIngredient);
      filesClientService.getPresignedDownloadUrlForObjectKey.mockResolvedValue(
        'https://s3.amazonaws.com/test',
      );
      filesClientService.uploadToExistingObject.mockResolvedValue({
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
