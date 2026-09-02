import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UsersController } from '@api/collections/users/controllers/users.controller';
import { UsersRelationshipsController } from '@api/collections/users/controllers/users-relationships.controller';
import { UsersService } from '@api/collections/users/services/users.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import type { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { ISubscriptionsService } from '@genfeedai/contracts/interfaces/billing';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';

describe('UsersController', () => {
  let controller: UsersController;
  let relationshipsController: UsersRelationshipsController;
  let usersService: Record<string, ReturnType<typeof vi.fn>>;
  let settingsService: Record<string, ReturnType<typeof vi.fn>>;
  let brandsService: Record<string, ReturnType<typeof vi.fn>>;
  let organizationsService: Record<string, ReturnType<typeof vi.fn>>;
  let subscriptionsService: Record<string, ReturnType<typeof vi.fn>>;
  let membersService: Record<string, ReturnType<typeof vi.fn>>;
  let filesClientService: Record<string, ReturnType<typeof vi.fn>>;
  let requestContextCacheService: Record<string, ReturnType<typeof vi.fn>>;
  let accessBootstrapCacheService: Record<string, ReturnType<typeof vi.fn>>;
  let betterAuthIdentityCacheService: Record<string, ReturnType<typeof vi.fn>>;
  let notificationPreferenceService: Record<string, ReturnType<typeof vi.fn>>;

  const userId = testId('user');
  const orgId = userId;
  const settingsId = userId;

  const mockUser = {
    id: 'user_subject_123',
    organizationId: orgId,
    userId: userId,
  } as never;

  const mockRequest = {
    get: vi.fn().mockReturnValue('localhost'),
    headers: {},
    path: '/users',
    protocol: 'https',
  } as never;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    usersService = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      hasOnboardingField: vi.fn(),
      patch: vi.fn(),
    };
    settingsService = { findOne: vi.fn(), patch: vi.fn() };
    brandsService = {
      clearBrandSelectionForUser: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      selectBrandForUser: vi.fn(),
    };
    organizationsService = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
    };
    subscriptionsService = { findOne: vi.fn() };
    membersService = {
      findOne: vi.fn(),
      setLastUsedBrand: vi.fn().mockResolvedValue({}),
    };
    filesClientService = {
      getPresignedUploadUrl: vi.fn().mockResolvedValue({
        publicUrl: 'https://cdn.example.com/avatar.jpg',
        s3Key: 'avatars/key',
        uploadUrl: 'https://s3.example.com/upload',
      }),
    };
    requestContextCacheService = {
      invalidateForUser: vi.fn().mockResolvedValue(undefined),
    };
    accessBootstrapCacheService = {
      invalidateForUser: vi.fn().mockResolvedValue(undefined),
    };
    betterAuthIdentityCacheService = {
      invalidateForUser: vi.fn().mockResolvedValue(undefined),
    };
    notificationPreferenceService = {
      findForUser: vi.fn().mockResolvedValue({
        channel: 'email',
        id: 'preference-1',
        isEnabled: false,
        topic: 'workflow.status',
        userId,
      }),
      setForUser: vi.fn().mockResolvedValue({
        channel: 'email',
        id: 'preference-1',
        isEnabled: true,
        topic: 'workflow.status',
        userId,
      }),
    };
    // The real fan-out over mocked caches, so the assertions below still prove
    // each individual cache is busted rather than just that the facade was hit.
    const userAccessCacheService = new UserAccessCacheService(
      requestContextCacheService as unknown as RequestContextCacheService,
      accessBootstrapCacheService as unknown as AccessBootstrapCacheService,
      betterAuthIdentityCacheService as unknown as BetterAuthIdentityCacheService,
    );
    controller = new UsersController(
      brandsService as unknown as BrandsService,
      usersService as unknown as UsersService,
      subscriptionsService as unknown as ISubscriptionsService,
      filesClientService as unknown as FilesClientService,
      membersService as unknown as MembersService,
      userAccessCacheService,
    );
    relationshipsController = new UsersRelationshipsController(
      brandsService as unknown as BrandsService,
      usersService as unknown as UsersService,
      organizationsService as unknown as OrganizationsService,
      settingsService as unknown as SettingsService,
      mockLogger as unknown as LoggerService,
      membersService as unknown as MembersService,
      userAccessCacheService,
      notificationPreferenceService as never,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(relationshipsController).toBeDefined();
  });

  describe('workflow email notification preference', () => {
    it('reads the current account preference', async () => {
      await relationshipsController.findWorkflowEmailNotificationPreference(
        mockRequest,
        mockUser,
      );

      expect(notificationPreferenceService.findForUser).toHaveBeenCalledWith(
        userId,
      );
    });

    it('updates only the current account preference', async () => {
      await relationshipsController.updateWorkflowEmailNotificationPreference(
        mockRequest,
        mockUser,
        { isEnabled: true },
      );

      expect(notificationPreferenceService.setForUser).toHaveBeenCalledWith(
        userId,
        true,
      );
    });
  });

  describe('relationship reads and selection', () => {
    it('scopes visible brands to the current organization and member restrictions', async () => {
      membersService.findOne.mockResolvedValue({
        brands: ['brand-1', 'brand-2'],
      });
      brandsService.findAll.mockResolvedValue({ docs: [] });

      await relationshipsController.findMeBrands(mockUser, mockRequest, {
        limit: 20,
      } as never);

      expect(brandsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { credentials: true },
          where: {
            id: { in: ['brand-1', 'brand-2'] },
            isDeleted: false,
            organizationId: orgId,
          },
        }),
        expect.any(Object),
      );
    });

    it('persists organization selection and invalidates access caches', async () => {
      organizationsService.findOne.mockResolvedValue({
        id: 'organization-canonical-id',
      });
      organizationsService.patch.mockResolvedValue({
        id: 'organization-canonical-id',
        isSelected: true,
      });

      await relationshipsController.updateOrganizationSelection(
        mockRequest,
        mockUser,
        'organization-canonical-id',
      );

      expect(organizationsService.findOne).toHaveBeenCalledWith({
        id: 'organization-canonical-id',
        userId,
      });
      expect(usersService.patch).toHaveBeenCalledWith(userId, {
        lastUsedOrganizationId: 'organization-canonical-id',
      });
      expect(requestContextCacheService.invalidateForUser).toHaveBeenCalledWith(
        userId,
      );
      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).toHaveBeenCalledWith(userId);
      expect(
        betterAuthIdentityCacheService.invalidateForUser,
      ).toHaveBeenCalledWith(userId);
    });
  });

  describe('findMe', () => {
    it('should return current user data', async () => {
      subscriptionsService.findOne.mockResolvedValue(null);
      usersService.findOne.mockResolvedValue({
        id: userId,
        isOnboardingCompleted: true,
      });

      const result = await controller.findMe(mockRequest, mockUser);

      expect(usersService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when user does not exist', async () => {
      subscriptionsService.findOne.mockResolvedValue(null);
      usersService.findOne.mockResolvedValue(null);

      await expect(controller.findMe(mockRequest, mockUser)).rejects.toThrow();
    });

    it('should auto-complete onboarding when user has subscription', async () => {
      subscriptionsService.findOne.mockResolvedValue({
        status: 'active',
      });
      usersService.findOne.mockResolvedValue({
        id: userId,
        isOnboardingCompleted: false,
      });
      usersService.hasOnboardingField.mockResolvedValue(false);
      usersService.patch.mockResolvedValue({
        id: userId,
        isOnboardingCompleted: true,
      });

      const result = await controller.findMe(mockRequest, mockUser);

      expect(usersService.patch).toHaveBeenCalled();
      expect(requestContextCacheService.invalidateForUser).toHaveBeenCalledWith(
        userId,
      );
      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).toHaveBeenCalledWith(userId);
      expect(result).toBeDefined();
    });
  });

  describe('updateMeAssetGate', () => {
    it('persists the escape hatch and invalidates the user access caches', async () => {
      usersService.patch.mockResolvedValue({
        hasDismissedAssetGate: true,
        id: userId,
      });

      const result = await controller.updateMeAssetGate(mockRequest, mockUser, {
        hasDismissedAssetGate: true,
      });

      expect(usersService.patch).toHaveBeenCalledWith(userId, {
        hasDismissedAssetGate: true,
      });
      // invalidateAll busts all three per-user caches so the next
      // /auth/bootstrap reflects the dismissal immediately.
      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).toHaveBeenCalledWith(userId);
      expect(requestContextCacheService.invalidateForUser).toHaveBeenCalledWith(
        userId,
      );
      expect(
        betterAuthIdentityCacheService.invalidateForUser,
      ).toHaveBeenCalledWith(userId);
      expect(result).toBeDefined();
    });
  });

  describe('findMeSettings', () => {
    it('should return user settings', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        settings: {
          id: settingsId,
          isSidebarProgressCollapsed: true,
          theme: 'dark',
        },
      });

      const result = await relationshipsController.findMeSettings(
        mockRequest,
        mockUser,
      );

      expect(result).toBeDefined();
      expect(usersService.findOne).toHaveBeenCalled();
    });

    it('should throw when user has no settings', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        settings: null,
      });

      await expect(
        relationshipsController.findMeSettings(mockRequest, mockUser),
      ).rejects.toThrow();
    });
  });

  describe('updateMeSettings', () => {
    it('should update user settings and return serialized data', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        settings: { id: settingsId },
      });
      settingsService.patch.mockResolvedValue({
        id: settingsId,
        isSidebarProgressCollapsed: true,
        theme: 'light',
      });

      const result = await relationshipsController.updateMeSettings(
        mockRequest,
        mockUser,
        {
          isSidebarProgressCollapsed: true,
          theme: 'light',
        } as never,
      );

      expect(settingsService.patch).toHaveBeenCalledWith(
        settingsId,
        expect.objectContaining({
          isSidebarProgressCollapsed: true,
          theme: 'light',
        }),
      );
      expect(result).toBeDefined();
    });

    it('should patch the sidebar progress collapsed field independently', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        settings: { id: settingsId },
      });
      settingsService.patch.mockResolvedValue({
        id: settingsId,
        isSidebarProgressCollapsed: false,
      });

      const result = await relationshipsController.updateMeSettings(
        mockRequest,
        mockUser,
        {
          isSidebarProgressCollapsed: false,
        } as never,
      );

      expect(settingsService.patch).toHaveBeenCalledWith(
        settingsId,
        expect.objectContaining({
          isSidebarProgressCollapsed: false,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should update settings from the canonical relation id', async () => {
      usersService.findOne.mockResolvedValue({
        id: 'prisma-user-id',
        settings: { id: settingsId },
      });
      settingsService.patch.mockResolvedValue({
        id: settingsId,
        isSidebarProgressCollapsed: true,
      });

      const result = await relationshipsController.updateMeSettings(
        mockRequest,
        mockUser,
        {
          isSidebarProgressCollapsed: true,
        } as never,
      );

      expect(settingsService.patch).toHaveBeenCalledWith(
        settingsId,
        expect.objectContaining({
          isSidebarProgressCollapsed: true,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should find settings by Prisma user id when relation is not populated', async () => {
      usersService.findOne.mockResolvedValue({
        id: 'prisma-user-id',
        settings: null,
      });
      settingsService.findOne.mockResolvedValue({
        id: settingsId,
        theme: 'dark',
      });
      settingsService.patch.mockResolvedValue({
        id: settingsId,
        theme: 'light',
      });

      const result = await relationshipsController.updateMeSettings(
        mockRequest,
        mockUser,
        {
          theme: 'light',
        } as never,
      );

      expect(settingsService.findOne).toHaveBeenCalledWith({
        userId: 'prisma-user-id',
      });
      expect(settingsService.patch).toHaveBeenCalledWith(
        settingsId,
        expect.objectContaining({
          theme: 'light',
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('updateSettings', () => {
    it('should update user settings by user id route', async () => {
      usersService.findOne.mockResolvedValue({
        id: 'prisma-user-id',
        settings: { id: settingsId },
      });
      settingsService.patch.mockResolvedValue({
        id: settingsId,
        theme: 'light',
      });

      const result = await relationshipsController.updateSettings(
        mockRequest,
        userId,
        {
          theme: 'light',
        } as never,
      );

      expect(usersService.findOne).toHaveBeenCalledWith({
        id: userId,
      });
      expect(settingsService.patch).toHaveBeenCalledWith(
        settingsId,
        expect.objectContaining({
          theme: 'light',
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('updateMe', () => {
    it('should update user profile', async () => {
      usersService.patch.mockResolvedValue({
        id: userId,
        firstName: 'Updated',
      });

      const result = await controller.updateMe(mockRequest, mockUser, {
        firstName: 'Updated',
      } as never);

      expect(usersService.patch).toHaveBeenCalledWith(userId, {
        firstName: 'Updated',
      });
      expect(result).toBeDefined();
    });

    it('should throw when patch returns null', async () => {
      usersService.patch.mockResolvedValue(null);

      await expect(
        controller.updateMe(mockRequest, mockUser, {
          firstName: 'X',
        } as never),
      ).rejects.toThrow();
    });

    it('completes onboarding using the canonical database user id', async () => {
      usersService.findOne
        .mockResolvedValueOnce({
          id: 'user_canonical_1',
          isOnboardingCompleted: false,
        })
        .mockResolvedValueOnce({
          id: 'user_canonical_1',
          isOnboardingCompleted: true,
        });
      usersService.patch.mockResolvedValue({
        id: 'user_canonical_1',
        isOnboardingCompleted: true,
      });

      const result = await controller.updateMe(mockRequest, mockUser, {
        isOnboardingCompleted: true,
      } as never);

      expect(usersService.findOne).toHaveBeenNthCalledWith(1, {
        id: userId,
      });
      expect(usersService.patch).toHaveBeenCalledWith(
        'user_canonical_1',
        expect.objectContaining({ isOnboardingCompleted: true }),
      );
      expect(requestContextCacheService.invalidateForUser).toHaveBeenCalledWith(
        'user_canonical_1',
      );
      expect(usersService.findOne).toHaveBeenNthCalledWith(2, {
        id: 'user_canonical_1',
      });
      expect(result).toBeDefined();
    });

    it('rejects onboarding completion when the canonical user is missing', async () => {
      usersService.findOne.mockResolvedValue(null);

      await expect(
        controller.updateMe(mockRequest, mockUser, {
          isOnboardingCompleted: true,
        } as never),
      ).rejects.toThrow('User account not found');

      expect(usersService.patch).not.toHaveBeenCalled();
    });
  });

  describe('getAvatarUploadUrl', () => {
    it('should return presigned upload URL for avatar', async () => {
      const result = await controller.getAvatarUploadUrl(mockUser, {
        contentType: 'image/png',
      });

      expect(filesClientService.getPresignedUploadUrl).toHaveBeenCalled();
      expect(result).toHaveProperty('uploadUrl');
      expect(result).toHaveProperty('publicUrl');
      expect(result).toHaveProperty('s3Key');
    });
  });

  describe('updateBrandSelection', () => {
    it('persists the selected canonical brand id', async () => {
      const canonicalId = 'clbrandcuid000000000000001';
      brandsService.selectBrandForUser.mockResolvedValue({
        id: canonicalId,
        label: 'Selected Brand',
      });

      const result = await relationshipsController.updateBrandSelection(
        mockRequest,
        mockUser,
        canonicalId,
      );

      expect(membersService.setLastUsedBrand).toHaveBeenCalledWith(
        {
          isActive: true,
          isDeleted: false,
          organizationId: orgId,
          userId,
        },
        canonicalId,
      );
      expect(requestContextCacheService.invalidateForUser).toHaveBeenCalledWith(
        userId,
      );
      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).toHaveBeenCalledWith(userId);
      expect(result).toBeDefined();
    });
  });

  describe('updateMe brand selection', () => {
    it('should clear brand selection and clear last-used brand on member', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        firstName: 'Current',
      });

      const result = await controller.updateMe(mockRequest, mockUser, {
        selectedBrandId: null,
      } as never);

      expect(brandsService.clearBrandSelectionForUser).toHaveBeenCalledWith(
        userId,
        orgId,
      );
      expect(membersService.setLastUsedBrand).toHaveBeenCalledWith(
        {
          isActive: true,
          isDeleted: false,
          organizationId: orgId,
          userId,
        },
        null,
      );
      expect(requestContextCacheService.invalidateForUser).toHaveBeenCalledWith(
        userId,
      );
      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).toHaveBeenCalledWith(userId);
      expect(usersService.patch).not.toHaveBeenCalled();
      expect(usersService.findOne).toHaveBeenCalledWith({
        id: userId,
      });
      expect(result).toBeDefined();
    });

    it('should select a brand and persist last-used brand from PATCH /users/me', async () => {
      const canonicalId = 'clbrandcuid000000000000002';
      brandsService.selectBrandForUser.mockResolvedValue({
        id: canonicalId,
        label: 'Selected Brand',
      });
      usersService.findOne.mockResolvedValue({
        id: userId,
        firstName: 'Current',
      });

      const result = await controller.updateMe(mockRequest, mockUser, {
        selectedBrandId: canonicalId,
      } as never);

      expect(brandsService.selectBrandForUser).toHaveBeenCalledWith(
        canonicalId,
        userId,
        orgId,
      );
      expect(membersService.setLastUsedBrand).toHaveBeenCalledWith(
        {
          isActive: true,
          isDeleted: false,
          organizationId: orgId,
          userId,
        },
        canonicalId,
      );
      expect(usersService.patch).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('getOnboardingStatus', () => {
    it('should return onboarding status for own user', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        isOnboardingCompleted: false,
        onboardingStepsCompleted: ['brand'],
      });

      const result = await controller.getOnboardingStatus(
        mockRequest,
        mockUser,
        userId,
      );

      expect(result).toBeDefined();
    });

    it('should throw for unauthorized user', async () => {
      const otherUserId = userId;

      await expect(
        controller.getOnboardingStatus(mockRequest, mockUser, otherUserId),
      ).rejects.toThrow();
    });
  });

  describe('updateOnboardingStatus', () => {
    it('should update onboarding and set timestamps', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        isOnboardingCompleted: false,
        onboardingStartedAt: null,
      });
      usersService.patch.mockResolvedValue({
        id: userId,
        isOnboardingCompleted: true,
        onboardingCompletedAt: new Date(),
        onboardingStartedAt: new Date(),
      });

      const result = await controller.updateOnboardingStatus(
        mockRequest,
        mockUser,
        userId,
        {
          isOnboardingCompleted: true,
          onboardingStepsCompleted: ['brand', 'providers', 'summary'],
        } as never,
      );

      expect(usersService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
