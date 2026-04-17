import { ModelsService } from '@api/collections/models/services/models.service';
import { Profile } from '@api/collections/profiles/schemas/profile.schema';
import { ProfilesService } from '@api/collections/profiles/services/profiles.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let mockProfileModel: ReturnType<typeof vi.fn> &
    Record<string, ReturnType<typeof vi.fn>>;
  let mockModelsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockReplicateService: Record<string, ReturnType<typeof vi.fn>>;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const orgId = 'test-object-id'.toString();
  const userId = 'test-object-id'.toString();
  const profileId = 'test-object-id'.toString();

  beforeEach(async () => {
    // Use a real constructor function so `new this.profileModel()` works
    function MockProfileModel(
      this: Record<string, unknown>,
      data: Record<string, unknown>,
    ) {
      Object.assign(this, data);
      this._id = new string(profileId);
      this.save = vi.fn().mockResolvedValue(this);
      this.toObject = vi.fn().mockReturnValue({ ...data, _id: profileId });
    }
    mockProfileModel = MockProfileModel as unknown as ReturnType<typeof vi.fn> &
      Record<string, ReturnType<typeof vi.fn>>;

    mockProfileModel.find = vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });
    mockProfileModel.findOne = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    mockProfileModel.findOneAndUpdate = vi.fn().mockReturnValue(null);
    mockProfileModel.updateMany = vi
      .fn()
      .mockResolvedValue({ modifiedCount: 0 });
    mockProfileModel.updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });

    mockReplicateService = {
      generateTextCompletionSync: vi.fn().mockResolvedValue('enhanced prompt'),
    };
    mockModelsService = {
      findOne: vi.fn().mockResolvedValue({
        cost: 1,
        minCost: 1,
        pricingType: 'fixed',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: mockProfileModel },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ModelsService,
          useValue: mockModelsService,
        },
        {
          provide: ReplicateService,
          useValue: mockReplicateService,
        },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new profile', async () => {
      const dto = { isDefault: false, label: 'New Profile' };

      const result = await service.create(dto as never, orgId, userId);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('_id');
    });

    it('should unset other defaults when creating a default profile', async () => {
      const dto = { isDefault: true, label: 'Default Profile' };

      await service.create(dto as never, orgId, userId);

      expect(mockProfileModel.updateMany).toHaveBeenCalledWith(
        { isDefault: true, organization: orgId },
        { $set: { isDefault: false } },
      );
    });
  });

  describe('findAll', () => {
    it('should return profiles for the organization', async () => {
      const profiles = [{ _id: profileId, label: 'Profile 1' }];
      mockProfileModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(profiles),
        }),
      });

      const result = await service.findAll(orgId);

      expect(result).toEqual(profiles);
    });

    it('should filter by isDefault', async () => {
      mockProfileModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      });

      await service.findAll(orgId, { isDefault: true });

      expect(mockProfileModel.find).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a profile by id and orgId', async () => {
      const profile = { _id: profileId, label: 'Test Profile' };
      mockProfileModel.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(profile),
      });

      const result = await service.findOne(profileId, orgId);

      expect(result).toEqual(profile);
    });

    it('should throw NotFoundException when profile not found', async () => {
      mockProfileModel.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      await expect(service.findOne('nonexistent', orgId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getDefault', () => {
    it('should return the default profile for an org', async () => {
      const defaultProfile = { _id: profileId, isDefault: true };
      mockProfileModel.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(defaultProfile),
      });

      const result = await service.getDefault(orgId);

      expect(result).toEqual(defaultProfile);
      expect(mockProfileModel.findOne).toHaveBeenCalledWith({
        isDefault: true,
        isDeleted: false,
        organization: orgId,
      });
    });

    it('should return null when no default profile exists', async () => {
      mockProfileModel.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const result = await service.getDefault(orgId);

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a profile and return updated version', async () => {
      const updatedProfile = {
        _id: profileId,
        label: 'Updated',
        toObject: vi.fn().mockReturnValue({ _id: profileId, label: 'Updated' }),
      };
      mockProfileModel.findOneAndUpdate.mockReturnValue(updatedProfile);

      const result = await service.update(
        profileId,
        { label: 'Updated' } as never,
        orgId,
      );

      expect(result).toEqual({ _id: profileId, label: 'Updated' });
    });

    it('should unset other defaults when setting as default', async () => {
      mockProfileModel.findOneAndUpdate.mockReturnValue({
        toObject: vi.fn().mockReturnValue({}),
      });

      await service.update(profileId, { isDefault: true } as never, orgId);

      expect(mockProfileModel.updateMany).toHaveBeenCalledWith(
        { _id: { $ne: profileId }, isDefault: true, organization: orgId },
        { $set: { isDefault: false } },
      );
    });

    it('should throw NotFoundException when profile not found for update', async () => {
      mockProfileModel.findOneAndUpdate.mockReturnValue(null);

      await expect(
        service.update('nonexistent', { label: 'Foo' } as never, orgId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete a profile', async () => {
      mockProfileModel.updateOne.mockResolvedValue({ matchedCount: 1 });

      await expect(service.remove(profileId, orgId)).resolves.not.toThrow();
    });

    it('should throw NotFoundException when profile not found for deletion', async () => {
      mockProfileModel.updateOne.mockResolvedValue({ matchedCount: 0 });

      await expect(service.remove('nonexistent', orgId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('applyProfile', () => {
    it('should enhance prompt using specified profile', async () => {
      const profile = {
        _id: profileId,
        article: { writingStyle: 'conversational' },
      };
      mockProfileModel.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(profile),
      });
      mockProfileModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.applyProfile(
        {
          contentType: 'article',
          profileId,
          prompt: 'Write an article',
        } as never,
        orgId,
      );

      expect(result.original).toBe('Write an article');
      expect(result.enhanced).toBe('enhanced prompt');
      expect(result.profileUsed).toEqual(profile);
    });

    it('should throw when no profile specified and no default exists', async () => {
      mockProfileModel.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.applyProfile(
          { contentType: 'article', prompt: 'Write' } as never,
          orgId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
