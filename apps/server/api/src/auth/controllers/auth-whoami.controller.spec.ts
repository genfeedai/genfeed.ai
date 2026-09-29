import { AuthWhoamiController } from '@api/auth/controllers/auth-whoami.controller';
import { MembersService } from '@api/collections/members/services/members.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
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

  describe('whoami', () => {
    const databaseUserId = testId('user');

    it('resolves the organization role from the active membership', async () => {
      mockMembersService.findOne.mockResolvedValue({ role: { key: 'owner' } });

      const result = await controller.whoami(
        buildReq({
          id: 'auth_user_123',
          organizationId: 'org_abc',
          userId: 'user_1',
        }),
      );

      expect(mockMembersService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          organizationId: 'org_abc',
          userId: 'user_1',
        }),
        expect.any(Array),
      );
      expect(result.data.role).toBe('owner');
    });

    it('skips the lookup and returns empty role when org or user is missing', async () => {
      const result = await controller.whoami(buildReq({ userId: 'user_1' }));

      expect(mockMembersService.findOne).not.toHaveBeenCalled();
      expect(result.data.role).toBe('');
    });

    it('never throws on a membership-lookup failure (returns empty role) and logs a warning', async () => {
      mockMembersService.findOne.mockRejectedValue(new Error('db down'));

      const result = await controller.whoami(
        buildReq({
          organizationId: 'org_abc',
          userId: 'user_1',
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
        isApiKey: true,
        organizationId: 'org_def',
        scopes: ['generate'],
        userId: 'user_789',
      });

      const result = await controller.whoami(req);

      expect(result.data.isApiKey).toBe(true);
      expect(result.data.organization.id).toBe('org_def');
      expect(result.data.scopes).toEqual(['generate']);
      // No membership stubbed → role resolves to '' (deny-by-default downstream).
      expect(result.data.role).toBe('');
    });

    it('does not inherit org-admin membership for an API key without an admin scope', async () => {
      mockMembersService.findOne.mockResolvedValue({ role: { key: 'admin' } });

      const result = await controller.whoami(
        buildReq({
          id: 'apikey_123',
          isApiKey: true,
          organizationId: 'org_def',
          scopes: ['videos:read'],
          userId: 'user_789',
        }),
      );

      expect(result.data.role).toBe('');
      expect(result.data.scopes).toEqual(['videos:read']);
    });

    it('should handle missing identity gracefully', async () => {
      const req = buildReq({
        emailAddresses: [{ emailAddress: 'test@test.com' }],
        firstName: 'Test',
        id: 'user_123',
      });

      const result = await controller.whoami(req);

      expect(result.data.isApiKey).toBe(false);
      expect(result.data.organization.id).toBe('');
      expect(result.data.organization.name).toBe('');
      expect(result.data.scopes).toEqual([]);
      expect(result.data.user.id).toBe('user_123');
    });

    it('falls back to the Better Auth user id when no explicit userId is set', async () => {
      const req = buildReq({
        id: 'auth_user_id',
      });

      const result = await controller.whoami(req);

      expect(result.data.user.id).toBe('auth_user_id');
      expect(result.data.user.authUserId).toBe('auth_user_id');
    });

    it('should handle completely empty user object', async () => {
      const req = buildReq({});

      const result = await controller.whoami(req);

      expect(result.data.isApiKey).toBe(false);
      expect(result.data.organization.id).toBe('');
      expect(result.data.organization.name).toBe('');
      expect(result.data.scopes).toEqual([]);
      expect(result.data.user.email).toBe('');
      expect(result.data.user.id).toBe('');
      expect(result.data.user.authUserId).toBe('');
      expect(result.data.user.name).toBe('');
    });

    it('should handle undefined user gracefully', async () => {
      const req = buildReq();

      const result = await controller.whoami(req);

      expect(result.data.isApiKey).toBe(false);
      expect(result.data.scopes).toEqual([]);
    });

    it('returns a legacy Better Auth base62 user id unchanged', async () => {
      const legacyUserId = 'Xk2p9QvL3mN8rT5wYz1aBc4dEf6gHj7K';
      const req = buildReq({
        id: legacyUserId,
        isApiKey: true,
        organizationId: 'org_abc',
        userId: legacyUserId,
      });

      const result = await controller.whoami(req);

      expect(result.data.user.id).toBe(legacyUserId);
      expect(result.data.organization.id).toBe('org_abc');
    });

    it('should trim name when lastName has trailing spaces', async () => {
      const req = buildReq({
        emailAddresses: [],
        firstName: 'John',
        lastName: 'Doe  ',
      });

      const result = await controller.whoami(req);

      expect(result.data.user.name).toBe('John Doe');
    });
  });
});
