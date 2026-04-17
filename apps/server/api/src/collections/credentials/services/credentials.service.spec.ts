import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { type Credential } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('CredentialsService', () => {
  let service: CredentialsService;
  let mockBrandsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockCredentialModel: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    mockBrandsService = {
      create: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
    };

    mockCredentialModel = {
      aggregate: vi.fn(),
      aggregatePaginate: vi.fn(),
      collection: { name: 'credentials' },
      create: vi.fn(),
      deleteOne: vi.fn(),
      find: vi.fn(),
      findById: vi
        .fn()
        .mockReturnValue({ exec: vi.fn(), populate: vi.fn().mockReturnThis() }),
      findByIdAndUpdate: vi
        .fn()
        .mockReturnValue({ exec: vi.fn(), populate: vi.fn().mockReturnThis() }),
      findOne: vi
        .fn()
        .mockReturnValue({ exec: vi.fn(), populate: vi.fn().mockReturnThis() }),
      findOneAndUpdate: vi.fn(),
      modelName: 'Credential',
      paginate: vi.fn(),
      updateMany: vi.fn().mockReturnValue({ exec: vi.fn() }),
      updateOne: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CredentialsService,
        { provide: PrismaService, useValue: mockCredentialModel },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: BrandsService,
          useValue: mockBrandsService,
        },
      ],
    }).compile();

    service = module.get<CredentialsService>(CredentialsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveCredentials', () => {
    it('should save credentials for a user and brand', async () => {
      const userId = '507f1f77bcf86cd799439011'; // Valid ObjectId
      const brandId = '507f1f77bcf86cd799439012'; // Valid ObjectId
      const orgId = '507f1f77bcf86cd799439014'; // Valid ObjectId
      const platform = CredentialPlatform.TWITTER;
      const fields = { accessToken: 'token123' };

      const brand = {
        _id: brandId,
        organization: orgId,
        user: userId,
      };

      const savedDoc = {
        _id: '507f1f77bcf86cd799439013',
        brand: brandId,
        organization: orgId,
        platform,
        user: userId,
        ...fields,
      };

      // Mock findOne to return null (no existing credential)
      mockCredentialModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      // Spy on create to avoid needing a constructable model mock
      vi.spyOn(service, 'create').mockResolvedValue(savedDoc as any);

      const result = await service.saveCredentials(brand, platform, fields);

      expect(result).toBeDefined();
    });

    it('should update existing credential instead of creating new one', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const brandId = '507f1f77bcf86cd799439012';
      const orgId = '507f1f77bcf86cd799439014';
      const platform = CredentialPlatform.TWITTER;

      const existingDoc = {
        _id: '507f1f77bcf86cd799439013',
        brand: brandId,
        organization: orgId,
        platform,
      };

      mockCredentialModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(existingDoc),
        populate: vi.fn().mockReturnThis(),
      });

      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue(existingDoc as never);

      const brand = { _id: brandId, organization: orgId, user: userId };
      await service.saveCredentials(brand, platform, {
        accessToken: 'new-token',
      });

      expect(patchSpy).toHaveBeenCalledWith(
        existingDoc._id,
        expect.objectContaining({ isDeleted: false }),
      );
    });
  });

  describe('findByHandle', () => {
    it('should normalize handle by removing @ prefix', async () => {
      mockCredentialModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ _id: 'cred-1' }),
        populate: vi.fn().mockReturnThis(),
      });

      await service.findByHandle('@testuser', '507f1f77bcf86cd799439014');

      expect(mockCredentialModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          externalHandle: expect.objectContaining({
            $regex: expect.any(RegExp),
          }),
          isConnected: true,
          isDeleted: false,
        }),
      );
    });

    it('should return null when handle not found', async () => {
      mockCredentialModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findByHandle(
        'nonexistent',
        '507f1f77bcf86cd799439014',
      );
      expect(result).toBeNull();
    });

    it('should handle handle without @ prefix', async () => {
      mockCredentialModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ _id: 'cred-2' }),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findByHandle(
        'testuser',
        '507f1f77bcf86cd799439014',
      );
      expect(result).toBeDefined();
    });
  });
});
