import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UsersController } from '@api/collections/users/controllers/users.controller';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: Record<string, ReturnType<typeof vi.fn>>;
  let settingsService: Record<string, ReturnType<typeof vi.fn>>;
  let brandsService: Record<string, ReturnType<typeof vi.fn>>;
  let organizationsService: Record<string, ReturnType<typeof vi.fn>>;
  let subscriptionsService: Record<string, ReturnType<typeof vi.fn>>;
  let clerkService: Record<string, ReturnType<typeof vi.fn>>;
  let membersService: Record<string, ReturnType<typeof vi.fn>>;
  let filesClientService: Record<string, ReturnType<typeof vi.fn>>;
  let requestContextCacheService: Record<string, ReturnType<typeof vi.fn>>;
  let accessBootstrapCacheService: Record<string, ReturnType<typeof vi.fn>>;

  const userId = '507f191e810c19729de860ee'.toString();
  const orgId = '507f191e810c19729de860ee'.toString();
  const settingsId = '507f191e810c19729de860ee'.toString();

  const mockUser = {
    id: 'clerk_user_123',
    publicMetadata: { organization: orgId, user: userId },
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
    settingsService = { patch: vi.fn() };
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
    clerkService = {
      updateUserPublicMetadata: vi.fn().mockResolvedValue({}),
    };
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

    controller = new UsersController(
      brandsService as unknown as BrandsService,
      usersService as unknown as UsersService,
      subscriptionsService as unknown as SubscriptionsService,
      organizationsService as unknown as OrganizationsService,
      settingsService as unknown as SettingsService,
      clerkService as unknown as ClerkService,
      filesClientService as unknown as FilesClientService,
      mockLogger as unknown as LoggerService,
      membersService as unknown as MembersService,
      requestContextCacheService as unknown as RequestContextCacheService,
      accessBootstrapCacheService as unknown as AccessBootstrapCacheService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findMe', () => {
    it('should return current user data', async () => {
      subscriptionsService.findOne.mockResolvedValue(null);
      usersService.findOne.mockResolvedValue({
        _id: userId,
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
        _id: userId,
        isOnboardingCompleted: false,
      });
      usersService.hasOnboardingField.mockResolvedValue(false);
      usersService.patch.mockResolvedValue({
        _id: userId,
        isOnboardingCompleted: true,
      });

      const result = await controller.findMe(mockRequest, mockUser);

      expect(usersService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findMeSettings', () => {
    it('should return user settings', async () => {
      usersService.findOne.mockResolvedValue({
        _id: userId,
        settings: {
          _id: settingsId,
          isSidebarProgressCollapsed: true,
          theme: 'dark',
        },
      });

      const result = await controller.findMeSettings(mockRequest, mockUser);

      expect(result).toBeDefined();
      expect(usersService.findOne).toHaveBeenCalled();
    });

    it('should throw when user has no settings', async () => {
      usersService.findOne.mockResolvedValue({
        _id: userId,
        settings: null,
      });

      await expect(
        controller.findMeSettings(mockRequest, mockUser),
      ).rejects.toThrow();
    });
  });

  describe('updateMeSettings', () => {
    it('should update user settings and return serialized data', async () => {
      usersService.findOne.mockResolvedValue({
        _id: userId,
        settings: { _id: settingsId },
      });
      settingsService.patch.mockResolvedValue({
        _id: settingsId,
        isSidebarProgressCollapsed: true,
        theme: 'light',
      });

      const result = await controller.updateMeSettings(mockRequest, mockUser, {
        isSidebarProgressCollapsed: true,
        theme: 'light',
      } as never);

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
        _id: userId,
        settings: { _id: settingsId },
      });
      settingsService.patch.mockResolvedValue({
        _id: settingsId,
        isSidebarProgressCollapsed: false,
      });

      const result = await controller.updateMeSettings(mockRequest, mockUser, {
        isSidebarProgressCollapsed: false,
      } as never);

      expect(settingsService.patch).toHaveBeenCalledWith(
        settingsId,
        expect.objectContaining({
          isSidebarProgressCollapsed: false,
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('updateMe', () => {
    it('should update user profile', async () => {
      usersService.patch.mockResolvedValue({
        _id: userId,
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

  describe('confirmAvatarUpload', () => {
    it('should update user avatar URL', async () => {
      usersService.patch.mockResolvedValue({
        _id: userId,
        avatar: 'https://cdn.example.com/avatar.jpg',
      });

      const result = await controller.confirmAvatarUpload(
        mockRequest,
        mockUser,
        { publicUrl: 'https://cdn.example.com/avatar.jpg' },
      );

      expect(usersService.patch).toHaveBeenCalledWith(userId, {
        avatar: 'https://cdn.example.com/avatar.jpg',
      });
      expect(result).toBeDefined();
    });
  });

  describe('updateBrandSelection', () => {
    it('should select brand and update clerk metadata', async () => {
      const selectedBrandId = '507f191e810c19729de860ee';
      brandsService.selectBrandForUser.mockResolvedValue({
        _id: selectedBrandId,
        label: 'Selected Brand',
      });

      const result = await controller.updateBrandSelection(
        mockRequest,
        mockUser,
        selectedBrandId.toString(),
      );

      expect(clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'clerk_user_123',
        { brand: selectedBrandId },
      );
      expect(membersService.setLastUsedBrand).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('clearBrandSelection', () => {
    it('should clear brand selection and remove brand metadata', async () => {
      await controller.clearBrandSelection(mockUser);

      expect(brandsService.clearBrandSelectionForUser).toHaveBeenCalledWith(
        userId,
        orgId,
      );
      expect(clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'clerk_user_123',
        { brand: undefined },
      );
      expect(requestContextCacheService.invalidateForUser).toHaveBeenCalledWith(
        'clerk_user_123',
      );
      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).toHaveBeenCalledWith('clerk_user_123');
    });
  });

  describe('getOnboardingStatus', () => {
    it('should return onboarding status for own user', async () => {
      usersService.findOne.mockResolvedValue({
        _id: userId,
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
      const otherUserId = '507f191e810c19729de860ee'.toString();

      await expect(
        controller.getOnboardingStatus(mockRequest, mockUser, otherUserId),
      ).rejects.toThrow();
    });
  });

  describe('updateOnboardingStatus', () => {
    it('should update onboarding and set timestamps', async () => {
      usersService.findOne.mockResolvedValue({
        _id: userId,
        isOnboardingCompleted: false,
        onboardingStartedAt: null,
      });
      usersService.patch.mockResolvedValue({
        _id: userId,
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
          onboardingStepsCompleted: ['brand', 'plan'],
        } as never,
      );

      expect(usersService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
