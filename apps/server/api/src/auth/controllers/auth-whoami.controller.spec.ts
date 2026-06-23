import { AuthWhoamiController } from '@api/auth/controllers/auth-whoami.controller';
import { MembersService } from '@api/collections/members/services/members.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

const buildReq = (
  user?: Record<string, unknown> & {
    email?: string;
    emailAddresses?: Array<{ emailAddress?: string }>;
  },
) => ({ user });

describe('AuthWhoamiController', () => {
  let controller: AuthWhoamiController;
  const mockMembersService = {
    findOne: vi.fn(),
  };
  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    mockMembersService.findOne.mockReset().mockResolvedValue(null);
    mockLogger.warn.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthWhoamiController],
      providers: [
        { provide: MembersService, useValue: mockMembersService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthWhoamiController>(AuthWhoamiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('whoami', () => {
    const mongoUserId = '507f191e810c19729de860ee'.toString();

    it('should return full user context for authenticated user', async () => {
      mockMembersService.findOne.mockResolvedValue({ role: { key: 'admin' } });

      const req = buildReq({
        emailAddresses: [{ emailAddress: 'john@example.com' }],
        firstName: 'John',
        id: 'auth_user_123',
        lastName: 'Doe',
        publicMetadata: {
          isApiKey: false,
          organization: 'org_abc',
          organizationName: 'Test Org',
          scopes: ['read', 'write'],
          user: mongoUserId,
        },
      });

      const result = await controller.whoami(req);

      expect(result).toEqual({
        data: {
          isApiKey: false,
          organization: {
            id: 'org_abc',
            name: 'Test Org',
          },
          role: 'admin',
          scopes: ['read', 'write'],
          user: {
            authUserId: 'auth_user_123',
            email: 'john@example.com',
            id: mongoUserId,
            name: 'John Doe',
          },
        },
      });
    });

    it('resolves the organization role from the active membership', async () => {
      mockMembersService.findOne.mockResolvedValue({ role: { key: 'owner' } });

      const result = await controller.whoami(
        buildReq({
          id: 'auth_user_123',
          publicMetadata: { organization: 'org_abc', user: 'user_1' },
        }),
      );

      expect(mockMembersService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          isDeleted: false,
          organization: 'org_abc',
          user: 'user_1',
        }),
        expect.any(Array),
      );
      expect(result.data.role).toBe('owner');
    });

    it('returns an empty role when the user has no membership', async () => {
      mockMembersService.findOne.mockResolvedValue(null);

      const result = await controller.whoami(
        buildReq({
          publicMetadata: { organization: 'org_abc', user: 'user_1' },
        }),
      );

      expect(result.data.role).toBe('');
    });

    it('skips the lookup and returns empty role when org or user is missing', async () => {
      const result = await controller.whoami(
        buildReq({ publicMetadata: { user: 'user_1' } }),
      );

      expect(mockMembersService.findOne).not.toHaveBeenCalled();
      expect(result.data.role).toBe('');
    });

    it('never throws on a membership-lookup failure (returns empty role) and logs a warning', async () => {
      mockMembersService.findOne.mockRejectedValue(new Error('db down'));

      const result = await controller.whoami(
        buildReq({
          publicMetadata: { organization: 'org_abc', user: 'user_1' },
        }),
      );

      expect(result.data.role).toBe('');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed to resolve organization role'),
        expect.objectContaining({
          error: 'db down',
          organizationId: 'org_abc',
          userId: 'user_1',
        }),
      );
    });

    it('should return API key context', async () => {
      const req = buildReq({
        email: 'api@example.com',
        id: 'apikey_123',
        publicMetadata: {
          isApiKey: true,
          organization: 'org_def',
          organizationName: 'API Org',
          scopes: ['generate'],
          user: 'user_789',
        },
      });

      const result = await controller.whoami(req);

      expect(result.data.isApiKey).toBe(true);
      expect(result.data.organization.id).toBe('org_def');
      expect(result.data.scopes).toEqual(['generate']);
      // No membership stubbed → role resolves to '' (deny-by-default downstream).
      expect(result.data.role).toBe('');
    });

    it('resolves the role for an API key whose user has a membership', async () => {
      mockMembersService.findOne.mockResolvedValue({ role: { key: 'admin' } });

      const result = await controller.whoami(
        buildReq({
          id: 'apikey_123',
          publicMetadata: {
            isApiKey: true,
            organization: 'org_def',
            user: 'user_789',
          },
        }),
      );

      expect(mockMembersService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ organization: 'org_def', user: 'user_789' }),
        expect.any(Array),
      );
      expect(result.data.role).toBe('admin');
    });

    it('should handle missing publicMetadata gracefully', async () => {
      const req = buildReq({
        emailAddresses: [{ emailAddress: 'test@test.com' }],
        firstName: 'Test',
        id: 'user_123',
      });

      const result = await controller.whoami(req);

      expect(result.data.isApiKey).toBe(false);
      expect(result.data.organization.id).toBe('');
      expect(result.data.organization.name).toBe('');
      expect(result.data.scopes).toEqual(['*']);
      expect(result.data.user.id).toBe('');
    });

    it('should handle missing email addresses', async () => {
      const req = buildReq({
        firstName: 'Test',
        id: 'user_123',
        publicMetadata: {
          user: 'user_123',
        },
      });

      const result = await controller.whoami(req);

      expect(result.data.user.email).toBe('');
    });

    it('should handle user with only firstName (no lastName)', async () => {
      const req = buildReq({
        emailAddresses: [{ emailAddress: 'test@test.com' }],
        firstName: 'Solo',
        id: 'user_123',
        publicMetadata: {
          user: 'user_123',
        },
      });

      const result = await controller.whoami(req);

      expect(result.data.user.name).toBe('Solo');
    });

    it('should handle user with no firstName', async () => {
      const req = buildReq({
        emailAddresses: [{ emailAddress: 'test@test.com' }],
        id: 'user_123',
        publicMetadata: {
          user: 'user_123',
        },
      });

      const result = await controller.whoami(req);

      expect(result.data.user.name).toBe('');
    });

    it('should fallback to user.email when emailAddresses is empty', async () => {
      const req = buildReq({
        email: 'fallback@example.com',
        emailAddresses: [],
        firstName: 'Fallback',
        id: 'user_123',
        publicMetadata: {
          user: 'user_123',
        },
      });

      const result = await controller.whoami(req);

      expect(result.data.user.email).toBe('fallback@example.com');
    });

    it('should keep mongo user id empty when publicMetadata.user is missing', async () => {
      const req = buildReq({
        id: 'auth_user_id',
        publicMetadata: {},
      });

      const result = await controller.whoami(req);

      expect(result.data.user.id).toBe('');
      expect(result.data.user.authUserId).toBe('auth_user_id');
    });

    it('should handle completely empty user object', async () => {
      const req = buildReq({});

      const result = await controller.whoami(req);

      expect(result.data.isApiKey).toBe(false);
      expect(result.data.organization.id).toBe('');
      expect(result.data.organization.name).toBe('');
      expect(result.data.scopes).toEqual(['*']);
      expect(result.data.user.email).toBe('');
      expect(result.data.user.id).toBe('');
      expect(result.data.user.authUserId).toBe('');
      expect(result.data.user.name).toBe('');
    });

    it('should handle undefined user gracefully', async () => {
      const req = buildReq();

      const result = await controller.whoami(req);

      expect(result.data.isApiKey).toBe(false);
      expect(result.data.scopes).toEqual(['*']);
    });

    it('should return empty mongo user id when metadata user id is not a valid ObjectId', async () => {
      const req = buildReq({
        id: 'auth_user_id',
        publicMetadata: {
          user: 'user_123',
        },
      });

      const result = await controller.whoami(req);

      expect(result.data.user.id).toBe('');
      expect(result.data.user.authUserId).toBe('auth_user_id');
    });

    it('should trim name when lastName has trailing spaces', async () => {
      const req = buildReq({
        emailAddresses: [],
        firstName: 'John',
        lastName: 'Doe  ',
        publicMetadata: {},
      });

      const result = await controller.whoami(req);

      expect(result.data.user.name).toBe('John Doe');
    });

    it('should handle both firstName and empty lastName', async () => {
      const req = buildReq({
        emailAddresses: [],
        firstName: 'Alice',
        lastName: '',
        publicMetadata: {},
      });

      const result = await controller.whoami(req);

      expect(result.data.user.name).toBe('Alice');
    });

    it('should return default scopes as ["*"] when not provided', async () => {
      const req = buildReq({
        id: 'user_123',
        publicMetadata: {
          organization: 'org_123',
        },
      });

      const result = await controller.whoami(req);

      expect(result.data.scopes).toEqual(['*']);
    });
  });
});
