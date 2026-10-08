import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { SettingsService } from '@api/collections/settings/services/settings.service';
import { UsersController } from '@api/collections/users/controllers/users.controller';
import { UsersRelationshipsController } from '@api/collections/users/controllers/users-relationships.controller';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import type { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { ISubscriptionsService } from '@genfeedai/contracts/interfaces/billing';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

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
  let serverFunnelCaptureService: Record<string, ReturnType<typeof vi.fn>>;

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
      patchAll: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      recordSignupAttribution: vi.fn().mockResolvedValue(true),
    };
    settingsService = {
      findOne: vi.fn(),
      patch: vi.fn(),
      patchWithFavoriteWorkflowIds: vi.fn(),
      withLiveFavoriteWorkflowIds: vi
        .fn()
        .mockImplementation(async (settings: unknown) => settings),
    };
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
      setCurrentBrand: vi.fn().mockResolvedValue({}),
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
    serverFunnelCaptureService = {
      capture: vi.fn().mockResolvedValue(undefined),
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
      userAccessCacheService,
      settingsService as unknown as SettingsService,
      serverFunnelCaptureService as never,
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

    describe('tenant isolation guard (CLOUD)', () => {
      const guardSubscriptionLookup = (where: Record<string, unknown>) =>
        assertTenantScopedQuery({
          args: { where },
          isCloud: true,
          model: 'Subscription',
          operation: 'findFirst',
          tenantModelNames: new Set(['Subscription']),
        });

      beforeEach(() => {
        usersService.findOne.mockResolvedValue({
          id: userId,
          isOnboardingCompleted: true,
        });
      });

      it('looks the subscription up inside the request organization', async () => {
        subscriptionsService.findOne.mockImplementation(async (where) => {
          guardSubscriptionLookup(where);
          return null;
        });

        await expect(
          runWithTenantContext({ organizationId: orgId }, () =>
            controller.findMe(mockRequest, mockUser),
          ),
        ).resolves.toBeDefined();

        expect(subscriptionsService.findOne).toHaveBeenCalledWith({
          organizationId: orgId,
          userId,
        });
      });

      it('scopes by the request-context organization when the token lags behind a switch', async () => {
        const switchedOrgId = testId('switched-org');
        subscriptionsService.findOne.mockImplementation(async (where) => {
          guardSubscriptionLookup(where);
          return null;
        });

        await expect(
          runWithTenantContext({ organizationId: switchedOrgId }, () =>
            controller.findMe(
              {
                ...(mockRequest as object),
                context: { organizationId: switchedOrgId },
              } as never,
              mockUser,
            ),
          ),
        ).resolves.toBeDefined();

        expect(subscriptionsService.findOne).toHaveBeenCalledWith({
          organizationId: switchedOrgId,
          userId,
        });
      });

      it('keeps the user-only lookup when the session has no organization', async () => {
        subscriptionsService.findOne.mockResolvedValue(null);

        await controller.findMe(mockRequest, {
          id: 'user_subject_123',
          userId,
        } as never);

        expect(subscriptionsService.findOne).toHaveBeenCalledWith({ userId });
      });
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

  describe('recordMeSignupAttribution', () => {
    it('records attribution for the canonical current user id', async () => {
      await controller.recordMeSignupAttribution(mockUser, {
        utmSource: 'chatgpt',
      });

      expect(usersService.recordSignupAttribution).toHaveBeenCalledWith(
        userId,
        { utmSource: 'chatgpt' },
      );
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
    it.each(['personal', 'favorites', 'admin'])(
      'invalidates the saved user snapshots after a %s settings write',
      async (route) => {
        const targetUserId = route === 'admin' ? 'other-user' : userId;
        usersService.findOne.mockResolvedValue({
          id: targetUserId,
          settings: { id: settingsId },
        });
        const saved = { id: settingsId, isAdvancedMode: false };
        settingsService.patch.mockResolvedValue(saved);
        settingsService.patchWithFavoriteWorkflowIds.mockResolvedValue(saved);

        if (route === 'admin') {
          await relationshipsController.updateSettings(
            mockRequest,
            {
              id: 'admin-subject',
              userId,
              organizationId: orgId,
              isSuperAdmin: true,
            } as never,
            targetUserId,
            { isAdvancedMode: false } as never,
          );
        } else {
          await relationshipsController.updateMeSettings(
            mockRequest,
            mockUser,
            (route === 'favorites'
              ? { favoriteWorkflowIds: [] }
              : { isAdvancedMode: false }) as never,
          );
        }

        expect(
          accessBootstrapCacheService.invalidateForUser,
        ).toHaveBeenCalledWith(targetUserId);
        expect(
          requestContextCacheService.invalidateForUser,
        ).toHaveBeenCalledWith(targetUserId);
        expect(
          betterAuthIdentityCacheService.invalidateForUser,
        ).toHaveBeenCalledWith(targetUserId);
      },
    );

    it('does not invalidate snapshots when the settings write fails', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        settings: { id: settingsId },
      });
      settingsService.patch.mockRejectedValue(new Error('write failed'));

      await expect(
        relationshipsController.updateMeSettings(mockRequest, mockUser, {
          isAdvancedMode: false,
        } as never),
      ).rejects.toThrow('write failed');

      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).not.toHaveBeenCalled();
    });

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
    it('updates the settings when the route user is the caller', async () => {
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
        mockUser,
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

    it('rejects updating another user settings with 403', async () => {
      const otherUserId = testId('other-user');

      await expect(
        relationshipsController.updateSettings(
          mockRequest,
          mockUser,
          otherUserId,
          { theme: 'light' } as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(usersService.findOne).not.toHaveBeenCalled();
      expect(settingsService.findOne).not.toHaveBeenCalled();
      expect(settingsService.patch).not.toHaveBeenCalled();
    });

    it('rejects a route user matching only the auth subject id', async () => {
      await expect(
        relationshipsController.updateSettings(
          mockRequest,
          mockUser,
          'user_subject_123',
          { theme: 'light' } as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(settingsService.patch).not.toHaveBeenCalled();
    });

    it('lets a superadmin update another user settings', async () => {
      const otherUserId = testId('other-user');
      const otherSettingsId = testId('other-settings');
      usersService.findOne.mockResolvedValue({
        id: otherUserId,
        settings: { id: otherSettingsId },
      });
      settingsService.patch.mockResolvedValue({
        id: otherSettingsId,
        theme: 'dark',
      });

      const result = await relationshipsController.updateSettings(
        mockRequest,
        { ...(mockUser as object), isSuperAdmin: true } as never,
        otherUserId,
        { theme: 'dark' } as never,
      );

      expect(usersService.findOne).toHaveBeenCalledWith({ id: otherUserId });
      expect(settingsService.patch).toHaveBeenCalledWith(
        otherSettingsId,
        expect.objectContaining({ theme: 'dark' }),
      );
      expect(result).toBeDefined();
    });

    it('honours a request context that revokes superadmin', async () => {
      await expect(
        relationshipsController.updateSettings(
          {
            ...(mockRequest as object),
            context: { isSuperAdmin: false },
          } as never,
          { ...(mockUser as object), isSuperAdmin: true } as never,
          testId('other-user'),
          { theme: 'dark' } as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(settingsService.patch).not.toHaveBeenCalled();
    });

    it('validates favorite workflows against the caller organization', async () => {
      usersService.findOne.mockResolvedValue({
        id: 'prisma-user-id',
        settings: { id: settingsId },
      });
      settingsService.patchWithFavoriteWorkflowIds.mockResolvedValue({
        id: settingsId,
      });

      await relationshipsController.updateSettings(
        mockRequest,
        mockUser,
        userId,
        { favoriteWorkflowIds: ['workflow-1'] } as never,
      );

      expect(settingsService.patchWithFavoriteWorkflowIds).toHaveBeenCalledWith(
        settingsId,
        { favoriteWorkflowIds: ['workflow-1'] },
        orgId,
      );
      expect(settingsService.patch).not.toHaveBeenCalled();
    });
  });

  describe('favorite workflows', () => {
    it('rejects invalid favorites before writing anything', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        settings: { id: settingsId },
      });
      settingsService.patchWithFavoriteWorkflowIds.mockRejectedValue(
        new BadRequestException('not available in this organization'),
      );

      await expect(
        relationshipsController.updateMeSettings(mockRequest, mockUser, {
          favoriteWorkflowIds: ['foreign-workflow'],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(settingsService.patchWithFavoriteWorkflowIds).toHaveBeenCalledWith(
        settingsId,
        { favoriteWorkflowIds: ['foreign-workflow'] },
        orgId,
      );
      expect(settingsService.patch).not.toHaveBeenCalled();
    });

    it('routes a null favorites list through validation instead of writing it', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        settings: { id: settingsId },
      });
      settingsService.patchWithFavoriteWorkflowIds.mockRejectedValue(
        new BadRequestException('favoriteWorkflowIds must be an array'),
      );

      await expect(
        relationshipsController.updateMeSettings(mockRequest, mockUser, {
          favoriteWorkflowIds: null,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(settingsService.patchWithFavoriteWorkflowIds).toHaveBeenCalledWith(
        settingsId,
        { favoriteWorkflowIds: null },
        orgId,
      );
      expect(settingsService.patch).not.toHaveBeenCalled();
    });

    it('uses the plain patch when the patch does not touch favorites', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        settings: { id: settingsId },
      });
      settingsService.patch.mockResolvedValue({ id: settingsId });

      await relationshipsController.updateMeSettings(mockRequest, mockUser, {
        theme: 'dark',
      } as never);

      expect(
        settingsService.patchWithFavoriteWorkflowIds,
      ).not.toHaveBeenCalled();
      expect(settingsService.patch).toHaveBeenCalledWith(
        settingsId,
        expect.objectContaining({ theme: 'dark' }),
      );
    });

    it('returns not found when the settings record vanished before the locked write', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        settings: { id: settingsId },
      });
      settingsService.patchWithFavoriteWorkflowIds.mockResolvedValue(null);

      await expect(
        relationshipsController.updateMeSettings(mockRequest, mockUser, {
          favoriteWorkflowIds: ['workflow-1'],
        } as never),
      ).rejects.toThrow();
      expect(
        settingsService.withLiveFavoriteWorkflowIds,
      ).not.toHaveBeenCalled();
    });

    it('returns only the live favorites of the locked write', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        settings: { id: settingsId },
      });
      settingsService.patchWithFavoriteWorkflowIds.mockResolvedValue({
        favoriteWorkflowIds: ['other-org-workflow', 'workflow-1', 'workflow-2'],
        id: settingsId,
      });
      settingsService.withLiveFavoriteWorkflowIds.mockImplementation(
        async (settings: Record<string, unknown>) => ({
          ...settings,
          favoriteWorkflowIds: ['workflow-1'],
        }),
      );

      const result = await relationshipsController.updateMeSettings(
        mockRequest,
        mockUser,
        { favoriteWorkflowIds: ['workflow-1', 'workflow-2'] } as never,
      );

      expect(settingsService.withLiveFavoriteWorkflowIds).toHaveBeenCalledWith(
        expect.objectContaining({ id: settingsId }),
        orgId,
      );
      expect(result).toMatchObject({
        data: { attributes: { favoriteWorkflowIds: ['workflow-1'] } },
      });
    });

    it('sends other settings fields through the same locked write', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        settings: { id: settingsId },
      });
      settingsService.patchWithFavoriteWorkflowIds.mockResolvedValue({
        id: settingsId,
      });

      await relationshipsController.updateMeSettings(mockRequest, mockUser, {
        favoriteWorkflowIds: ['workflow-1'],
        theme: 'dark',
      } as never);

      expect(settingsService.patchWithFavoriteWorkflowIds).toHaveBeenCalledWith(
        settingsId,
        { favoriteWorkflowIds: ['workflow-1'], theme: 'dark' },
        orgId,
      );
      expect(settingsService.patch).not.toHaveBeenCalled();
    });

    it('drops deleted favorites when settings are read', async () => {
      usersService.findOne.mockResolvedValue({
        id: userId,
        settings: {
          favoriteWorkflowIds: ['workflow-1', 'deleted-workflow'],
          id: settingsId,
        },
      });
      settingsService.withLiveFavoriteWorkflowIds.mockImplementation(
        async (settings: Record<string, unknown>) => ({
          ...settings,
          favoriteWorkflowIds: ['workflow-1'],
        }),
      );

      const result = await relationshipsController.findMeSettings(
        mockRequest,
        mockUser,
      );

      expect(settingsService.withLiveFavoriteWorkflowIds).toHaveBeenCalledWith(
        expect.objectContaining({ id: settingsId }),
        orgId,
      );
      expect(result).toMatchObject({
        data: { attributes: { favoriteWorkflowIds: ['workflow-1'] } },
      });
    });

    it('drops deleted favorites from the nested settings of GET /users/me', async () => {
      subscriptionsService.findOne.mockResolvedValue(null);
      usersService.findOne.mockResolvedValue({
        id: userId,
        isOnboardingCompleted: true,
        settings: {
          favoriteWorkflowIds: ['workflow-1', 'deleted-workflow'],
          id: settingsId,
        },
      });
      settingsService.withLiveFavoriteWorkflowIds.mockImplementation(
        async (settings: Record<string, unknown>) => ({
          ...settings,
          favoriteWorkflowIds: ['workflow-1'],
        }),
      );

      await controller.findMe(mockRequest, mockUser);

      expect(settingsService.withLiveFavoriteWorkflowIds).toHaveBeenCalledWith(
        expect.objectContaining({
          favoriteWorkflowIds: ['workflow-1', 'deleted-workflow'],
          id: settingsId,
        }),
        orgId,
      );
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
      usersService.patchAll.mockResolvedValue({ modifiedCount: 1 });

      const result = await controller.updateMe(mockRequest, mockUser, {
        isOnboardingCompleted: true,
      } as never);

      expect(usersService.findOne).toHaveBeenNthCalledWith(1, {
        id: userId,
      });
      // genfeedai/genfeed.ai#5311: the false->true transition is claimed
      // atomically (isOnboardingCompleted: false in the WHERE clause), not a
      // read-then-write `patch`.
      expect(usersService.patchAll).toHaveBeenCalledWith(
        { id: 'user_canonical_1', isOnboardingCompleted: false },
        expect.objectContaining({ isOnboardingCompleted: true }),
      );
      expect(usersService.patch).not.toHaveBeenCalled();
      expect(requestContextCacheService.invalidateForUser).toHaveBeenCalledWith(
        'user_canonical_1',
      );
      expect(usersService.findOne).toHaveBeenNthCalledWith(2, {
        id: 'user_canonical_1',
      });
      expect(result).toBeDefined();
      // genfeedai/genfeed.ai#5311: the funnel event is captured server-side,
      // gated on actually winning the atomic claim (modifiedCount === 1).
      expect(serverFunnelCaptureService.capture).toHaveBeenCalledTimes(1);
      expect(serverFunnelCaptureService.capture).toHaveBeenCalledWith({
        distinctId: 'user_canonical_1',
        event: 'onboarding_completed',
      });
    });

    it('rejects onboarding completion when the canonical user is missing', async () => {
      usersService.findOne.mockResolvedValue(null);

      await expect(
        controller.updateMe(mockRequest, mockUser, {
          isOnboardingCompleted: true,
        } as never),
      ).rejects.toThrow('User account not found');

      expect(usersService.patch).not.toHaveBeenCalled();
      expect(usersService.patchAll).not.toHaveBeenCalled();
      expect(serverFunnelCaptureService.capture).not.toHaveBeenCalled();
    });

    it('leaves the prior completion untouched and does not re-emit on a repeated onboarding-completion call', async () => {
      usersService.findOne.mockResolvedValue({
        id: 'user_canonical_1',
        isOnboardingCompleted: true,
      });
      usersService.patchAll.mockResolvedValue({ modifiedCount: 0 });

      await controller.updateMe(mockRequest, mockUser, {
        isOnboardingCompleted: true,
      } as never);
      await controller.updateMe(mockRequest, mockUser, {
        isOnboardingCompleted: true,
      } as never);

      expect(usersService.patchAll).toHaveBeenCalledTimes(2);
      expect(usersService.patchAll).toHaveBeenCalledWith(
        { id: 'user_canonical_1', isOnboardingCompleted: false },
        expect.objectContaining({ isOnboardingCompleted: true }),
      );
      expect(serverFunnelCaptureService.capture).not.toHaveBeenCalled();
    });

    it('emits onboarding_completed at most once when two wizard tabs race to complete the same user (genfeedai/genfeed.ai#5311)', async () => {
      usersService.findOne.mockResolvedValue({
        id: 'user_canonical_1',
        isOnboardingCompleted: false,
      });

      // Model the real Postgres guarantee: `isOnboardingCompleted: false` is
      // part of the WHERE clause, so only the first of two racing updateMany
      // calls (e.g. two browser tabs both finishing the wizard) can match the
      // still-false row.
      let claimed = false;
      usersService.patchAll.mockImplementation(
        async (filter: { isOnboardingCompleted?: boolean }) => {
          if (filter.isOnboardingCompleted === false && !claimed) {
            claimed = true;
            return { modifiedCount: 1 };
          }
          return { modifiedCount: 0 };
        },
      );

      await Promise.all([
        controller.updateMe(mockRequest, mockUser, {
          isOnboardingCompleted: true,
        } as never),
        controller.updateMe(mockRequest, mockUser, {
          isOnboardingCompleted: true,
        } as never),
      ]);

      expect(usersService.patchAll).toHaveBeenCalledTimes(2);
      expect(serverFunnelCaptureService.capture).toHaveBeenCalledTimes(1);
      expect(serverFunnelCaptureService.capture).toHaveBeenCalledWith({
        distinctId: 'user_canonical_1',
        event: 'onboarding_completed',
      });
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

      expect(brandsService.selectBrandForUser).toHaveBeenCalledWith(
        canonicalId,
        userId,
        orgId,
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
    it('rejects clearing the brand selection: currentBrandId is a required per-member invariant', async () => {
      await expect(
        controller.updateMe(mockRequest, mockUser, {
          selectedBrandId: null,
        } as never),
      ).rejects.toThrow(
        'selectedBrandId cannot be cleared: choose another brand instead.',
      );

      expect(brandsService.clearBrandSelectionForUser).not.toHaveBeenCalled();
      expect(brandsService.selectBrandForUser).not.toHaveBeenCalled();
      expect(
        requestContextCacheService.invalidateForUser,
      ).not.toHaveBeenCalled();
      expect(usersService.patch).not.toHaveBeenCalled();
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
      expect(requestContextCacheService.invalidateForUser).toHaveBeenCalledWith(
        userId,
      );
      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).toHaveBeenCalledWith(userId);
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
