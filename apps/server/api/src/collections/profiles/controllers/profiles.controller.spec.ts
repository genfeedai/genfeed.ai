vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { ProfilesController } from '@api/collections/profiles/controllers/profiles.controller';
import { AnalyzeToneDto } from '@api/collections/profiles/dto/analyze-tone.dto';
import { ApplyProfileDto } from '@api/collections/profiles/dto/apply-profile.dto';
import { CreateProfileDto } from '@api/collections/profiles/dto/create-profile.dto';
import { GenerateFromExamplesDto } from '@api/collections/profiles/dto/generate-from-examples.dto';
import { UpdateProfileDto } from '@api/collections/profiles/dto/update-profile.dto';
import { ProfilesService } from '@api/collections/profiles/services/profiles.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type { User } from '@clerk/backend';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ProfilesController', () => {
  let controller: ProfilesController;
  let service: ProfilesService;
  let mockReq: Request;

  const mockUser: User = {
    id: 'user_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockProfile = {
    _id: '507f1f77bcf86cd799439014',
    createdAt: new Date(),
    description: 'Formal and professional writing style',
    isDefault: false,
    label: 'Professional Tone',
    organization: '507f1f77bcf86cd799439012',
    tone: 'professional',
    updatedAt: new Date(),
  };

  const mockProfilesService = {
    analyzeTone: vi.fn(),
    applyProfile: vi.fn(),
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    generateFromExamples: vi.fn(),
    getDefault: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(async () => {
    mockReq = {} as Request;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ProfilesService,
          useValue: mockProfilesService,
        },
      ],
    })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProfilesController>(ProfilesController);
    service = module.get<ProfilesService>(ProfilesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a profile', async () => {
      const createDto: CreateProfileDto = {
        description: 'Formal style',
        label: 'Professional Tone',
        tone: 'professional',
      };

      mockProfilesService.create.mockResolvedValue(mockProfile);

      const result = await controller.create(mockReq, createDto, mockUser);

      expect(service.create).toHaveBeenCalledWith(
        createDto,
        mockUser.publicMetadata.organization,
        mockUser.id,
      );
      expect(result).toEqual(mockProfile);
    });
  });

  describe('findAll', () => {
    it('should return all profiles', async () => {
      const profiles = [mockProfile];
      mockProfilesService.findAll.mockResolvedValue(profiles);

      const result = await controller.findAll(mockReq, mockUser);

      expect(service.findAll).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        {
          isDefault: undefined,
          search: undefined,
        },
      );
      expect(result).toEqual(profiles);
    });

    it('should filter by search', async () => {
      mockProfilesService.findAll.mockResolvedValue([mockProfile]);

      await controller.findAll(mockReq, mockUser, 'professional');

      expect(service.findAll).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        {
          isDefault: undefined,
          search: 'professional',
        },
      );
    });

    it('should filter by isDefault', async () => {
      mockProfilesService.findAll.mockResolvedValue([mockProfile]);

      await controller.findAll(mockReq, mockUser, undefined, 'true');

      expect(service.findAll).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        {
          isDefault: true,
          search: undefined,
        },
      );
    });
  });

  describe('findOne', () => {
    it('should return a profile by id', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockProfilesService.findOne.mockResolvedValue(mockProfile);

      const result = await controller.findOne(mockReq, id, mockUser);

      expect(service.findOne).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(mockProfile);
    });
  });

  describe('update', () => {
    it('should update a profile', async () => {
      const id = '507f1f77bcf86cd799439014';
      const updateDto: UpdateProfileDto = {
        label: 'Updated Profile',
      };

      const updatedProfile = { ...mockProfile, ...updateDto };
      mockProfilesService.update.mockResolvedValue(updatedProfile);

      const result = await controller.update(mockReq, id, updateDto, mockUser);

      expect(service.update).toHaveBeenCalledWith(
        id,
        updateDto,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(updatedProfile);
    });
  });

  describe('remove', () => {
    it('should delete a profile', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockProfilesService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(id, mockUser);

      expect(service.remove).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual({ message: 'Profile deleted successfully' });
    });
  });

  describe('applyProfile', () => {
    it('should apply profile to prompt', async () => {
      const dto: ApplyProfileDto = {
        profileId: '507f1f77bcf86cd799439014',
        prompt: 'Original prompt',
      };

      const result = {
        enhanced: 'Enhanced with professional tone',
        original: 'Original prompt',
        profileApplied: '507f1f77bcf86cd799439014',
      };

      mockProfilesService.applyProfile.mockResolvedValue(result);

      const response = await controller.applyProfile(mockReq, dto, mockUser);

      expect(service.applyProfile).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
      expect(response).toEqual(result);
    });
  });

  describe('analyzeTone', () => {
    it('should analyze content tone', async () => {
      const dto: AnalyzeToneDto = {
        content: 'Test content',
        profileId: '507f1f77bcf86cd799439014',
      };

      const analysis = {
        compliance: 'high',
        score: 85,
        suggestions: ['Use more formal language'],
      };

      mockProfilesService.analyzeTone.mockResolvedValue(analysis);

      const result = await controller.analyzeTone(mockReq, dto, mockUser);

      expect(service.analyzeTone).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
      expect(result).toEqual(analysis);
    });
  });

  describe('getDefault', () => {
    it('should return default profile', async () => {
      const defaultProfile = { ...mockProfile, isDefault: true };
      mockProfilesService.getDefault.mockResolvedValue(defaultProfile);

      const result = await controller.getDefault(mockReq, mockUser);

      expect(service.getDefault).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(defaultProfile);
    });
  });

  describe('generateFromExamples', () => {
    it('should generate profile from examples', async () => {
      const dto: GenerateFromExamplesDto = {
        examples: ['Example 1', 'Example 2', 'Example 3'],
        label: 'Generated Profile',
      };

      mockProfilesService.generateFromExamples.mockResolvedValue(mockProfile);

      const result = await controller.generateFromExamples(
        mockReq,
        dto,
        mockUser,
      );

      expect(service.generateFromExamples).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        mockUser.id,
        expect.any(Function),
      );
      expect(result).toEqual(mockProfile);
    });
  });
});
