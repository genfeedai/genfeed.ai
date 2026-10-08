import { AuthWhoamiController } from '@api/auth/controllers/auth-whoami.controller';
import type { AuthenticatedUser as PolicyUser } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersService } from '@api/collections/members/services/members.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { getTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import {
  testId as policyTestId,
  testId,
} from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { getTenantContext } from '@libs/prisma/tenant-context';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { defer, firstValueFrom } from 'rxjs';

const buildReq = (
  user?: Record<string, unknown> & {
    email?: string;
    emailAddresses?: Array<{ emailAddress?: string }>;
  },
) => ({ user });

describe('AuthWhoamiController', () => {
  it('keeps whoami original identity behind the real owner interceptor', async () => {
    const owner: PolicyUser = {
      id: policyTestId('user'),
      userId: policyTestId('user'),
      organizationId: policyTestId('org'),
      brandId: policyTestId('brand'),
      isSuperAdmin: true,
      isApiKey: true,
      scopes: ['read'],
    };
    const req = {
      method: 'GET',
      query: {} as Record<string, string>,
      user: owner,
      context: {
        ...owner,
        isSuperAdmin: true,
        subscriptionTier: 'pro',
        stripeSubscriptionStatus: 'active',
        hydratedAt: 1,
      },
    };
    const context = req.context;
    const before = { ...context };
    const execution = {
      getClass: () => AuthWhoamiController,
      getHandler: () => AuthWhoamiController.prototype.whoami,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const interceptor = new TenantContextInterceptor(new Reflector());
    mockMembersService.findOne.mockResolvedValue({ role: { key: 'owner' } });
    const handle = vi.fn(() =>
      defer(async () => {
        expect(getTenantContext()?.organizationId).toBe(owner.organizationId);
        expect(getTenantReadScope()).toBeUndefined();
        return controller.whoami(req);
      }),
    );
    req.query = { organizationId: policyTestId('org', 2) };
    expect(() => interceptor.intercept(execution, { handle })).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(handle).not.toHaveBeenCalled();
    expect(mockMembersService.findOne).not.toHaveBeenCalled();
    const selections: Array<Record<string, string>> = [
      {},
      { organizationId: owner.organizationId },
    ];
    for (const query of selections) {
      req.query = query;
      const result = await firstValueFrom(
        interceptor.intercept(execution, { handle }),
      );
      expect(mockMembersService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: owner.organizationId,
          userId: owner.userId,
        }),
        expect.any(Array),
      );
      expect(result).toMatchObject({ data: { role: '' } });
      expect(req.user).toBe(owner);
      expect(req.context).toBe(context);
      expect(req.context).toEqual(before);
    }
  });
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
    const databaseUserId = testId('user');

    it('should return full user context for authenticated user', async () => {
      mockMembersService.findOne.mockResolvedValue({ role: { key: 'admin' } });

      const req = buildReq({
        emailAddresses: [{ emailAddress: 'john@example.com' }],
        firstName: 'John',
        id: 'auth_user_123',
        lastName: 'Doe',
        isApiKey: false,
        organizationId: 'org_abc',
        scopes: ['read', 'write'],
        userId: databaseUserId,
      });

      const result = await controller.whoami(req);

      expect(result).toEqual({
        data: {
          isApiKey: false,
          organization: {
            id: 'org_abc',
            name: '',
          },
          role: 'admin',
          scopes: ['read', 'write'],
          user: {
            authUserId: 'auth_user_123',
            email: 'john@example.com',
            id: databaseUserId,
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

    it('returns an empty role when the user has no membership', async () => {
      mockMembersService.findOne.mockResolvedValue(null);

      const result = await controller.whoami(
        buildReq({
          organizationId: 'org_abc',
          userId: 'user_1',
        }),
      );

      expect(result).toMatchObject({ data: { role: '' } });
    });

    it('skips the lookup and returns empty role when org or user is missing', async () => {
      const result = await controller.whoami(buildReq({ userId: 'user_1' }));

      expect(mockMembersService.findOne).not.toHaveBeenCalled();
      expect(result).toMatchObject({ data: { role: '' } });
    });

    it('never throws on a membership-lookup failure (returns empty role) and logs a warning', async () => {
      mockMembersService.findOne.mockRejectedValue(new Error('db down'));

      const result = await controller.whoami(
        buildReq({
          organizationId: 'org_abc',
          userId: 'user_1',
        }),
      );

      expect(result).toMatchObject({ data: { role: '' } });
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
      expect(result).toMatchObject({ data: { role: '' } });
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

      expect(result).toMatchObject({ data: { role: '' } });
      expect(result.data.scopes).toEqual(['videos:read']);
    });

    it('keeps membership role for an API key that was explicitly granted admin', async () => {
      mockMembersService.findOne.mockResolvedValue({ role: { key: 'owner' } });

      const result = await controller.whoami(
        buildReq({
          id: 'apikey_123',
          isApiKey: true,
          organizationId: 'org_def',
          scopes: ['admin'],
          userId: 'user_789',
        }),
      );

      expect(result.data.role).toBe('owner');
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

    it('should handle missing email addresses', async () => {
      const req = buildReq({
        firstName: 'Test',
        id: 'user_123',
        userId: 'user_123',
      });

      const result = await controller.whoami(req);

      expect(result.data.user.email).toBe('');
    });

    it('should handle user with only firstName (no lastName)', async () => {
      const req = buildReq({
        emailAddresses: [{ emailAddress: 'test@test.com' }],
        firstName: 'Solo',
        id: 'user_123',
        userId: 'user_123',
      });

      const result = await controller.whoami(req);

      expect(result.data.user.name).toBe('Solo');
    });

    it('should handle user with no firstName', async () => {
      const req = buildReq({
        emailAddresses: [{ emailAddress: 'test@test.com' }],
        id: 'user_123',
        userId: 'user_123',
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
        userId: 'user_123',
      });

      const result = await controller.whoami(req);

      expect(result.data.user.email).toBe('fallback@example.com');
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

    it('should handle both firstName and empty lastName', async () => {
      const req = buildReq({
        emailAddresses: [],
        firstName: 'Alice',
        lastName: '',
      });

      const result = await controller.whoami(req);

      expect(result.data.user.name).toBe('Alice');
    });

    it('returns no scopes when the identity does not grant any', async () => {
      const req = buildReq({
        id: 'user_123',
        organizationId: 'org_123',
      });

      const result = await controller.whoami(req);

      expect(result.data.scopes).toEqual([]);
    });
  });
});
