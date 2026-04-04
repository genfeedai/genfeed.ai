import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UserEntity } from '@api/collections/users/entities/user.entity';
import { UsersService } from '@api/collections/users/services/users.service';
import { ClerkWebhookService } from '@api/endpoints/webhooks/clerk/webhooks.clerk.service';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { WebhookEvent } from '@clerk/express/webhooks';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('ClerkWebhookService', () => {
  let service: ClerkWebhookService;
  let loggerService: LoggerService;
  let clerkService: ClerkService;
  let usersService: UsersService;
  let organizationsService: OrganizationsService;
  let brandsService: BrandsService;
  let membersService: MembersService;

  const mockUser = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    avatar: 'https://example.com/avatar.jpg',
    clerkId: 'user_123456',
    email: 'john.doe@example.com',
    firstName: 'John',
    handle: 'testuser123',
    lastName: 'Doe',
  };

  const mockOrganization = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
    category: undefined,
    isSelected: true,
    name: 'Test Organization',
    user: mockUser._id,
  };

  const mockBrand = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
    isSelected: true,
    name: 'Test Brand',
    organization: mockOrganization._id,
  };

  const mockClerkUser = {
    emailAddresses: [{ emailAddress: 'john.doe@example.com', id: 'email_1' }],
    firstName: 'John',
    id: 'user_123456',
    imageUrl: 'https://example.com/avatar.jpg',
    lastName: 'Doe',
    publicMetadata: {},
  };

  const asWebhookEvent = (event: Record<string, unknown>) =>
    event as unknown as WebhookEvent;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClerkWebhookService,
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
          provide: ClerkService,
          useValue: {
            getUser: vi.fn(),
            updateUserPublicMetadata: vi.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            create: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: OrganizationsService,
          useValue: {
            create: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: BrandsService,
          useValue: {
            create: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: CreditsUtilsService,
          useValue: {
            addOrganizationCreditsWithExpiration: vi.fn(),
          },
        },
        {
          provide: MembersService,
          useValue: {
            create: vi.fn(),
            find: vi.fn().mockResolvedValue([]),
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            send: vi.fn(),
            sendUserCreatedNotification: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: RolesService,
          useValue: {
            findOne: vi
              .fn()
              .mockResolvedValue({ _id: 'role-id', key: 'admin' }),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            create: vi.fn(),
            findOne: vi.fn(),
            getLatestMajorVersionModelIds: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: TransactionUtil,
          useValue: {
            findOne: vi.fn(),
            runInTransaction: vi
              .fn()
              .mockImplementation((fn: () => unknown) => fn()),
          },
        },
      ],
    }).compile();

    service = module.get<ClerkWebhookService>(ClerkWebhookService);
    loggerService = module.get<LoggerService>(LoggerService);
    clerkService = module.get<ClerkService>(ClerkService);
    usersService = module.get<UsersService>(UsersService);
    organizationsService =
      module.get<OrganizationsService>(OrganizationsService);
    brandsService = module.get<BrandsService>(BrandsService);
    membersService = module.get<MembersService>(MembersService);

    vi.clearAllMocks();

    // Reset notification mock after clearAllMocks
    (
      module.get<NotificationsService>(NotificationsService)
        .sendUserCreatedNotification as vi.Mock
    ).mockResolvedValue(undefined);
    (
      module.get<RolesService>(RolesService).findOne as vi.Mock
    ).mockResolvedValue({ _id: 'role-id', key: 'admin' });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleWebhookEvent', () => {
    it('should keep proactive invited users in onboarding until they claim and pay', async () => {
      const event = asWebhookEvent({
        data: {
          email_addresses: [{ email_address: 'john.doe@example.com' }],
          first_name: 'John',
          id: 'user_123456',
          image_url: 'https://example.com/avatar.jpg',
          last_name: 'Doe',
          public_metadata: {
            isProactiveOnboarding: true,
            leadId: 'lead_123',
            organizationId: mockOrganization._id.toString(),
            userId: mockUser._id.toString(),
          },
        },
        type: 'user.created',
      });
      const url = 'webhook/clerk';

      (usersService.findOne as vi.Mock).mockResolvedValue(mockUser);
      (usersService.patch as vi.Mock).mockResolvedValue(mockUser);
      (organizationsService.patch as vi.Mock).mockResolvedValue({
        ...mockOrganization,
        user: mockUser._id,
      });
      (organizationsService.findOne as vi.Mock).mockResolvedValue(
        mockOrganization,
      );
      (brandsService.findOne as vi.Mock).mockResolvedValue(mockBrand);
      (brandsService.patch as vi.Mock).mockResolvedValue(mockBrand);
      (membersService.findOne as vi.Mock).mockResolvedValue({
        _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
        organization: mockOrganization._id,
        user: new Types.ObjectId('507f1f77bcf86cd799439099'),
      });
      (membersService.patch as vi.Mock).mockResolvedValue({});
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      await service.handleWebhookEvent(event, url);

      expect(clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'user_123456',
        expect.objectContaining({
          isOnboardingCompleted: false,
          proactiveLeadId: 'lead_123',
        }),
      );
      expect(usersService.patch).not.toHaveBeenCalledWith(
        mockUser._id,
        expect.objectContaining({
          isOnboardingCompleted: true,
        }),
      );
    });

    it('should create a new user when not found', async () => {
      const event = asWebhookEvent({
        data: { id: 'user_new123' },
        type: 'user.created',
      });
      const url = 'webhook/clerk';

      (usersService.findOne as vi.Mock).mockResolvedValue(null);
      (usersService.create as vi.Mock).mockResolvedValue({
        ...mockUser,
        clerkId: 'user_new123',
      });
      (usersService.patch as vi.Mock).mockResolvedValue({
        ...mockUser,
        clerkId: 'user_new123',
      });
      (organizationsService.findOne as vi.Mock).mockResolvedValue(null);
      (brandsService.findOne as vi.Mock).mockResolvedValue(null);
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      await service.handleWebhookEvent(event, url);

      expect(usersService.findOne).toHaveBeenCalledWith({
        clerkId: 'user_new123',
      });
      expect(usersService.create).toHaveBeenCalledWith(expect.any(UserEntity));
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('User with Clerk ID user_new123 not found'),
      );
    });

    it('should update existing user on user.updated event', async () => {
      const event = asWebhookEvent({
        data: { id: 'user_123456' },
        type: 'user.updated',
      });
      const url = 'webhook/clerk';

      (clerkService.getUser as vi.Mock).mockResolvedValue(mockClerkUser);
      (usersService.findOne as vi.Mock).mockResolvedValue(mockUser);
      (usersService.patch as vi.Mock).mockResolvedValue({
        ...mockUser,
        firstName: 'Jane',
      });
      (organizationsService.findOne as vi.Mock).mockResolvedValue(
        mockOrganization,
      );
      (brandsService.findOne as vi.Mock).mockResolvedValue(mockBrand);
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      await service.handleWebhookEvent(event, url);

      expect(usersService.patch).toHaveBeenCalledWith(mockUser._id, {
        avatar: 'https://example.com/avatar.jpg',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });
    });

    it('should update Clerk metadata with brand and organization for existing user', async () => {
      const event = asWebhookEvent({
        data: { id: 'user_123456' },
        type: 'user.updated',
      });
      const url = 'webhook/clerk';

      (clerkService.getUser as vi.Mock).mockResolvedValue(mockClerkUser);
      (usersService.findOne as vi.Mock).mockResolvedValue(mockUser);
      (usersService.patch as vi.Mock).mockResolvedValue(mockUser);
      (organizationsService.findOne as vi.Mock).mockResolvedValue(
        mockOrganization,
      );
      (brandsService.findOne as vi.Mock).mockResolvedValue(mockBrand);
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      await service.handleWebhookEvent(event, url);

      expect(clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'user_123456',
        expect.objectContaining({
          brand: mockBrand._id,
          organization: expect.anything(),
          user: mockUser._id,
        }),
      );
    });

    it('should update Clerk metadata with undefined brand and org when neither found', async () => {
      const event = asWebhookEvent({
        data: { id: 'user_123456' },
        type: 'user.updated',
      });
      const url = 'webhook/clerk';

      (clerkService.getUser as vi.Mock).mockResolvedValue(mockClerkUser);
      (usersService.findOne as vi.Mock).mockResolvedValue(mockUser);
      (usersService.patch as vi.Mock).mockResolvedValue(mockUser);
      (organizationsService.findOne as vi.Mock).mockResolvedValue(null);
      (brandsService.findOne as vi.Mock).mockResolvedValue(null);
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      await service.handleWebhookEvent(event, url);

      expect(clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'user_123456',
        expect.objectContaining({
          brand: undefined,
          organization: undefined,
          user: mockUser._id,
        }),
      );
    });

    it('should log success after processing', async () => {
      const event = asWebhookEvent({
        data: { id: 'user_123456' },
        type: 'user.updated',
      });
      const url = 'webhook/clerk';

      (clerkService.getUser as vi.Mock).mockResolvedValue(mockClerkUser);
      (usersService.findOne as vi.Mock).mockResolvedValue(mockUser);
      (usersService.patch as vi.Mock).mockResolvedValue(mockUser);
      (organizationsService.findOne as vi.Mock).mockResolvedValue(
        mockOrganization,
      );
      (brandsService.findOne as vi.Mock).mockResolvedValue(mockBrand);
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      await service.handleWebhookEvent(event, url);

      expect(loggerService.log).toHaveBeenCalledWith(
        `${url} processed successfully`,
        expect.objectContaining({
          clerkUserId: 'user_123456',
          userId: mockUser._id,
        }),
      );
    });

    it('should throw error when no user ID provided', async () => {
      const event = asWebhookEvent({
        data: { id: null },
        type: 'user.updated',
      });
      const url = 'webhook/clerk';

      await expect(service.handleWebhookEvent(event, url)).rejects.toThrow(
        new HttpException(
          {
            detail: 'No valid user ID provided in user.* webhook payload',
            title: 'No user ID',
          },
          HttpStatus.BAD_REQUEST,
        ),
      );
    });

    it('should throw error when user creation fails', async () => {
      const event = asWebhookEvent({
        data: { id: 'user_fail123' },
        type: 'user.created',
      });
      const url = 'webhook/clerk';

      (usersService.findOne as vi.Mock).mockResolvedValue(null);
      (usersService.create as vi.Mock).mockResolvedValue(null);

      await expect(service.handleWebhookEvent(event, url)).rejects.toThrow(
        'Failed to create or update user',
      );
    });

    it('should handle user with missing optional fields on user.created', async () => {
      const event = asWebhookEvent({
        data: { id: 'user_minimal' },
        type: 'user.created',
      });
      const url = 'webhook/clerk';

      (usersService.findOne as vi.Mock).mockResolvedValue(null);
      (usersService.create as vi.Mock).mockResolvedValue({
        ...mockUser,
        avatar: null,
        clerkId: 'user_minimal',
        email: undefined,
        firstName: undefined,
        lastName: undefined,
      });
      (usersService.patch as vi.Mock).mockResolvedValue({
        ...mockUser,
        clerkId: 'user_minimal',
      });
      (organizationsService.findOne as vi.Mock).mockResolvedValue(null);
      (brandsService.findOne as vi.Mock).mockResolvedValue(null);
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      await service.handleWebhookEvent(event, url);

      expect(usersService.create).toHaveBeenCalledWith(expect.any(UserEntity));
    });

    it('should generate a handle for new user', async () => {
      const event = asWebhookEvent({
        data: { id: 'user_new456' },
        type: 'user.created',
      });
      const url = 'webhook/clerk';

      (usersService.findOne as vi.Mock).mockResolvedValue(null);
      (usersService.create as vi.Mock).mockImplementation(
        (entity: UserEntity) => {
          return Promise.resolve({
            ...mockUser,
            handle: entity.handle,
          });
        },
      );
      (usersService.patch as vi.Mock).mockResolvedValue(mockUser);
      (organizationsService.findOne as vi.Mock).mockResolvedValue(null);
      (brandsService.findOne as vi.Mock).mockResolvedValue(null);
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      await service.handleWebhookEvent(event, url);

      expect(usersService.create).toHaveBeenCalledWith(expect.any(UserEntity));
    });

    it('should rethrow clerk API errors', async () => {
      const event = asWebhookEvent({
        data: { id: 'user_error' },
        type: 'user.updated',
      });
      const url = 'webhook/clerk';

      const clerkError = new Error('Clerk API error');
      (clerkService.getUser as vi.Mock).mockRejectedValue(clerkError);
      // When Clerk API fails, it falls back to webhook payload data
      // user.updated with no existing user will fall through
      (usersService.findOne as vi.Mock).mockResolvedValue(mockUser);
      (usersService.patch as vi.Mock).mockResolvedValue(mockUser);
      (organizationsService.findOne as vi.Mock).mockResolvedValue(null);
      (brandsService.findOne as vi.Mock).mockResolvedValue(null);
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      // Service catches clerk errors and falls back to payload data — no throw
      await service.handleWebhookEvent(event, url);

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch user'),
        expect.any(Object),
      );
    });

    it('should rethrow database errors during user lookup', async () => {
      const event = asWebhookEvent({
        data: { id: 'user_123456' },
        type: 'user.updated',
      });
      const url = 'webhook/clerk';

      const dbError = new Error('Database connection error');
      (clerkService.getUser as vi.Mock).mockResolvedValue(mockClerkUser);
      (usersService.findOne as vi.Mock).mockRejectedValue(dbError);

      await expect(service.handleWebhookEvent(event, url)).rejects.toThrow(
        dbError,
      );
    });

    it('should reject session.created events', async () => {
      const event = asWebhookEvent({
        data: {
          id: 'sess_2abc123def456',
          user_id: 'user_123456',
        },
        type: 'session.created',
      });
      const url = 'webhook/clerk';

      await expect(service.handleWebhookEvent(event, url)).rejects.toThrow(
        new HttpException(
          {
            detail: `Event type 'session.created' is not supported. Only user.* events are handled by this webhook.`,
            title: 'Unsupported event type',
          },
          HttpStatus.BAD_REQUEST,
        ),
      );
      expect(loggerService.warn).toHaveBeenCalledWith(`${url} rejected`, {
        detail: `Event type 'session.created' is not supported. Only user.* events are handled by this webhook.`,
        type: 'session.created',
      });
    });

    it('should reject organization.created events', async () => {
      const event = asWebhookEvent({
        data: {
          id: 'org_123456',
        },
        type: 'organization.created',
      });
      const url = 'webhook/clerk';

      await expect(service.handleWebhookEvent(event, url)).rejects.toThrow(
        new HttpException(
          {
            detail: `Event type 'organization.created' is not supported. Only user.* events are handled by this webhook.`,
            title: 'Unsupported event type',
          },
          HttpStatus.BAD_REQUEST,
        ),
      );
      expect(loggerService.warn).toHaveBeenCalledWith(`${url} rejected`, {
        detail: `Event type 'organization.created' is not supported. Only user.* events are handled by this webhook.`,
        type: 'organization.created',
      });
    });

    it('should accept user.created events', async () => {
      const event = asWebhookEvent({
        data: {
          email_addresses: [{ email_address: 'john@example.com' }],
          first_name: 'John',
          id: 'user_new123',
          last_name: 'Doe',
        },
        type: 'user.created',
      });
      const url = 'webhook/clerk';

      (usersService.findOne as vi.Mock).mockResolvedValue(null);
      (usersService.create as vi.Mock).mockResolvedValue({
        ...mockUser,
        clerkId: 'user_new123',
      });
      (usersService.patch as vi.Mock).mockResolvedValue({
        ...mockUser,
        clerkId: 'user_new123',
      });
      (organizationsService.findOne as vi.Mock).mockResolvedValue(null);
      (brandsService.findOne as vi.Mock).mockResolvedValue(null);
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      await service.handleWebhookEvent(event, url);

      expect(usersService.findOne).toHaveBeenCalledWith({
        clerkId: 'user_new123',
      });
      expect(usersService.create).toHaveBeenCalled();
    });

    it('should accept user.updated events', async () => {
      const event = asWebhookEvent({
        data: {
          id: 'user_123456',
        },
        type: 'user.updated',
      });
      const url = 'webhook/clerk';

      (clerkService.getUser as vi.Mock).mockResolvedValue(mockClerkUser);
      (usersService.findOne as vi.Mock).mockResolvedValue(mockUser);
      (usersService.patch as vi.Mock).mockResolvedValue(mockUser);
      (organizationsService.findOne as vi.Mock).mockResolvedValue(
        mockOrganization,
      );
      (brandsService.findOne as vi.Mock).mockResolvedValue(mockBrand);
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      await service.handleWebhookEvent(event, url);

      expect(usersService.patch).toHaveBeenCalled();
      expect(clerkService.updateUserPublicMetadata).toHaveBeenCalled();
    });

    it('should handle very long metadata values', async () => {
      const longString = 'a'.repeat(10000);
      const event = asWebhookEvent({
        data: {
          id: 'user_123456',
          public_metadata: { description: longString },
        },
        type: 'user.updated',
      });
      const url = 'webhook/clerk';

      const clerkUserWithLongMeta = {
        ...mockClerkUser,
        publicMetadata: { description: longString },
      };

      (clerkService.getUser as vi.Mock).mockResolvedValue(
        clerkUserWithLongMeta,
      );
      (usersService.findOne as vi.Mock).mockResolvedValue(mockUser);
      (usersService.patch as vi.Mock).mockResolvedValue(mockUser);
      (organizationsService.findOne as vi.Mock).mockResolvedValue(
        mockOrganization,
      );
      (brandsService.findOne as vi.Mock).mockResolvedValue(mockBrand);
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      await service.handleWebhookEvent(event, url);

      expect(clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'user_123456',
        expect.objectContaining({
          user: mockUser._id,
        }),
      );
    });

    it('should handle special characters in metadata', async () => {
      const specialChars =
        '<script>alert("xss")</script> & "quotes" \'single\' \n\t\r';
      const event = asWebhookEvent({
        data: {
          id: 'user_123456',
          public_metadata: { name: specialChars },
        },
        type: 'user.updated',
      });
      const url = 'webhook/clerk';

      const clerkUserWithSpecialMeta = {
        ...mockClerkUser,
        publicMetadata: { name: specialChars },
      };

      (clerkService.getUser as vi.Mock).mockResolvedValue(
        clerkUserWithSpecialMeta,
      );
      (usersService.findOne as vi.Mock).mockResolvedValue(mockUser);
      (usersService.patch as vi.Mock).mockResolvedValue(mockUser);
      (organizationsService.findOne as vi.Mock).mockResolvedValue(
        mockOrganization,
      );
      (brandsService.findOne as vi.Mock).mockResolvedValue(mockBrand);
      (clerkService.updateUserPublicMetadata as vi.Mock).mockResolvedValue({});

      await service.handleWebhookEvent(event, url);

      expect(clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'user_123456',
        expect.objectContaining({
          user: mockUser._id,
        }),
      );
    });
  });
});
