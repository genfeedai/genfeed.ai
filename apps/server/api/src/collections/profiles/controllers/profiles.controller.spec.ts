vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
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
import { testId } from '@helpers/testing/test-id.helper';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const organizationId = testId('org');
const userId = testId('user');
const profileId = testId('profile');

describe('ProfilesController', () => {
  let controller: ProfilesController;
  let service: ProfilesService;
  let mockReq: Request;
  let creditsUtilsService: {
    checkOrganizationCreditsAvailable: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let modelsService: { findOne: ReturnType<typeof vi.fn> };

  const mockUser: User = {
    id: 'user_123',
    organizationId,
    userId,
  } as unknown as User;

  const mockProfile = {
    _id: profileId,
    createdAt: new Date(),
    description: 'Formal and professional writing style',
    isDefault: false,
    label: 'Professional Tone',
    organization: organizationId,
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
    creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
    };
    modelsService = { findOne: vi.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        {
          provide: CreditsUtilsService,
          useValue: creditsUtilsService,
        },
        {
          provide: ModelsService,
          useValue: modelsService,
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
        mockUser.organizationId,
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

      expect(service.findAll).toHaveBeenCalledWith(mockUser.organizationId, {
        isDefault: undefined,
        search: undefined,
      });
      expect(result).toEqual(profiles);
    });

    it('should filter by search', async () => {
      mockProfilesService.findAll.mockResolvedValue([mockProfile]);

      await controller.findAll(mockReq, mockUser, 'professional');

      expect(service.findAll).toHaveBeenCalledWith(mockUser.organizationId, {
        isDefault: undefined,
        search: 'professional',
      });
    });

    it('should filter by isDefault', async () => {
      mockProfilesService.findAll.mockResolvedValue([mockProfile]);

      await controller.findAll(mockReq, mockUser, undefined, 'true');

      expect(service.findAll).toHaveBeenCalledWith(mockUser.organizationId, {
        isDefault: true,
        search: undefined,
      });
    });
  });

  describe('findOne', () => {
    it('should return a profile by id', async () => {
      const id = profileId;
      mockProfilesService.findOne.mockResolvedValue(mockProfile);

      const result = await controller.findOne(mockReq, id, mockUser);

      expect(service.findOne).toHaveBeenCalledWith(id, mockUser.organizationId);
      expect(result).toEqual(mockProfile);
    });
  });

  describe('update', () => {
    it('should update a profile', async () => {
      const id = profileId;
      const updateDto: UpdateProfileDto = {
        label: 'Updated Profile',
      };

      const updatedProfile = { ...mockProfile, ...updateDto };
      mockProfilesService.update.mockResolvedValue(updatedProfile);

      const result = await controller.update(mockReq, id, updateDto, mockUser);

      expect(service.update).toHaveBeenCalledWith(
        id,
        updateDto,
        mockUser.organizationId,
      );
      expect(result).toEqual(updatedProfile);
    });
  });

  describe('remove', () => {
    it('should delete a profile', async () => {
      const id = profileId;
      mockProfilesService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(id, mockUser);

      expect(service.remove).toHaveBeenCalledWith(id, mockUser.organizationId);
      expect(result).toEqual({ message: 'Profile deleted successfully' });
    });
  });

  describe('applyProfile', () => {
    it('should apply profile to prompt', async () => {
      const dto: ApplyProfileDto = {
        profileId: profileId,
        prompt: 'Original prompt',
      };

      const result = {
        enhanced: 'Enhanced with professional tone',
        original: 'Original prompt',
        profileApplied: profileId,
      };

      mockProfilesService.applyProfile.mockResolvedValue(result);

      const response = await controller.applyProfile(mockReq, dto, mockUser);

      expect(service.applyProfile).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
        expect.any(Function),
        undefined,
      );
      expect(response).toEqual(result);
    });

    // #5375: BYOK — when the guard already granted a bypass, the platform
    // credits floor preflight is skipped and the resolved key reaches the
    // service call.
    it('skips the credits preflight and forwards the resolved BYOK key when the guard bypassed', async () => {
      const dto: ApplyProfileDto = {
        contentType: 'article',
        profileId,
        prompt: 'Original prompt',
      };
      const byokReq = {
        creditsConfig: {
          byokApiKeyOverride: 'org-openrouter-key',
          isByokBypass: true,
        },
      } as unknown as Request;
      mockProfilesService.applyProfile.mockResolvedValue({
        enhanced: 'Enhanced',
        original: 'Original prompt',
        profileApplied: profileId,
      });

      await controller.applyProfile(byokReq, dto, mockUser);

      // getDefaultTextMinimumCredits(modelsService) backs the preflight; the
      // whole preflight block is skipped when the guard already bypassed.
      expect(modelsService.findOne).not.toHaveBeenCalled();
      expect(service.applyProfile).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
        expect.any(Function),
        'org-openrouter-key',
      );
    });

    it('still runs the credits preflight when the guard did not bypass', async () => {
      const dto: ApplyProfileDto = {
        contentType: 'article',
        profileId,
        prompt: 'Original prompt',
      };
      mockProfilesService.applyProfile.mockResolvedValue({
        enhanced: 'Enhanced',
        original: 'Original prompt',
        profileApplied: profileId,
      });

      await controller.applyProfile(mockReq, dto, mockUser);

      expect(modelsService.findOne).toHaveBeenCalled();
    });
  });

  describe('analyzeTone', () => {
    it('should analyze content tone', async () => {
      const dto: AnalyzeToneDto = {
        content: 'Test content',
        profileId: profileId,
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
        mockUser.organizationId,
        expect.any(Function),
        undefined,
      );
      expect(result).toEqual(analysis);
    });

    it('skips the credits preflight and forwards the resolved BYOK key when the guard bypassed', async () => {
      const dto: AnalyzeToneDto = {
        content: 'Test content',
        contentType: 'article',
        profileId,
      };
      const byokReq = {
        creditsConfig: {
          byokApiKeyOverride: 'org-openrouter-key',
          isByokBypass: true,
        },
      } as unknown as Request;
      mockProfilesService.analyzeTone.mockResolvedValue({
        compliance: 'high',
        score: 85,
        suggestions: [],
      });

      await controller.analyzeTone(byokReq, dto, mockUser);

      expect(modelsService.findOne).not.toHaveBeenCalled();
      expect(service.analyzeTone).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
        expect.any(Function),
        'org-openrouter-key',
      );
    });

    it('still runs the credits preflight when the guard did not bypass', async () => {
      const dto: AnalyzeToneDto = {
        content: 'Test content',
        contentType: 'article',
        profileId,
      };
      mockProfilesService.analyzeTone.mockResolvedValue({
        compliance: 'high',
        score: 85,
        suggestions: [],
      });

      await controller.analyzeTone(mockReq, dto, mockUser);

      expect(modelsService.findOne).toHaveBeenCalled();
    });
  });

  describe('generateFromExamples', () => {
    it('should generate profile from examples', async () => {
      const dto: GenerateFromExamplesDto = {
        description: 'Generated from examples',
        examples: [
          { content: 'Example 1', contentType: 'article' },
          { content: 'Example 2', contentType: 'article' },
          { content: 'Example 3', contentType: 'article' },
        ],
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
        mockUser.organizationId,
        mockUser.id,
        expect.any(Function),
        undefined,
      );
      expect(result).toEqual(mockProfile);
    });

    it('skips the credits preflight and forwards the resolved BYOK key when the guard bypassed', async () => {
      const dto: GenerateFromExamplesDto = {
        description: 'Generated from examples',
        examples: [
          { content: 'Example 1', contentType: 'article' },
          { content: 'Example 2', contentType: 'article' },
        ],
        label: 'Generated Profile',
      };
      const byokReq = {
        creditsConfig: {
          byokApiKeyOverride: 'org-openrouter-key',
          isByokBypass: true,
        },
      } as unknown as Request;
      mockProfilesService.generateFromExamples.mockResolvedValue(mockProfile);

      await controller.generateFromExamples(byokReq, dto, mockUser);

      expect(modelsService.findOne).not.toHaveBeenCalled();
      expect(service.generateFromExamples).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
        mockUser.id,
        expect.any(Function),
        'org-openrouter-key',
      );
    });

    it('still runs the credits preflight when the guard did not bypass', async () => {
      const dto: GenerateFromExamplesDto = {
        description: 'Generated from examples',
        examples: [
          { content: 'Example 1', contentType: 'article' },
          { content: 'Example 2', contentType: 'article' },
        ],
        label: 'Generated Profile',
      };
      mockProfilesService.generateFromExamples.mockResolvedValue(mockProfile);

      await controller.generateFromExamples(mockReq, dto, mockUser);

      expect(modelsService.findOne).toHaveBeenCalled();
    });
  });
});
