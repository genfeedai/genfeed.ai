import { AuthWhoamiController } from '@api/auth/controllers/auth-whoami.controller';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

const buildReq = (
  user?: Record<string, unknown> & {
    email?: string;
    emailAddresses?: Array<{ emailAddress?: string }>;
  },
) => ({ user });

describe('AuthWhoamiController', () => {
  let controller: AuthWhoamiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthWhoamiController],
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
    const mongoUserId = new Types.ObjectId().toString();

    it('should return full user context for authenticated user', () => {
      const req = buildReq({
        emailAddresses: [{ emailAddress: 'john@example.com' }],
        firstName: 'John',
        id: 'clerk_user_123',
        lastName: 'Doe',
        publicMetadata: {
          isApiKey: false,
          organization: 'org_abc',
          organizationName: 'Test Org',
          scopes: ['read', 'write'],
          user: mongoUserId,
        },
      });

      const result = controller.whoami(req);

      expect(result).toEqual({
        data: {
          isApiKey: false,
          organization: {
            id: 'org_abc',
            name: 'Test Org',
          },
          scopes: ['read', 'write'],
          user: {
            clerkId: 'clerk_user_123',
            email: 'john@example.com',
            id: mongoUserId,
            name: 'John Doe',
          },
        },
      });
    });

    it('should return API key context', () => {
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

      const result = controller.whoami(req);

      expect(result.data.isApiKey).toBe(true);
      expect(result.data.organization.id).toBe('org_def');
      expect(result.data.scopes).toEqual(['generate']);
    });

    it('should handle missing publicMetadata gracefully', () => {
      const req = buildReq({
        emailAddresses: [{ emailAddress: 'test@test.com' }],
        firstName: 'Test',
        id: 'user_123',
      });

      const result = controller.whoami(req);

      expect(result.data.isApiKey).toBe(false);
      expect(result.data.organization.id).toBe('');
      expect(result.data.organization.name).toBe('');
      expect(result.data.scopes).toEqual(['*']);
      expect(result.data.user.id).toBe('');
    });

    it('should handle missing email addresses', () => {
      const req = buildReq({
        firstName: 'Test',
        id: 'user_123',
        publicMetadata: {
          user: 'user_123',
        },
      });

      const result = controller.whoami(req);

      expect(result.data.user.email).toBe('');
    });

    it('should handle user with only firstName (no lastName)', () => {
      const req = buildReq({
        emailAddresses: [{ emailAddress: 'test@test.com' }],
        firstName: 'Solo',
        id: 'user_123',
        publicMetadata: {
          user: 'user_123',
        },
      });

      const result = controller.whoami(req);

      expect(result.data.user.name).toBe('Solo');
    });

    it('should handle user with no firstName', () => {
      const req = buildReq({
        emailAddresses: [{ emailAddress: 'test@test.com' }],
        id: 'user_123',
        publicMetadata: {
          user: 'user_123',
        },
      });

      const result = controller.whoami(req);

      expect(result.data.user.name).toBe('');
    });

    it('should fallback to user.email when emailAddresses is empty', () => {
      const req = buildReq({
        email: 'fallback@example.com',
        emailAddresses: [],
        firstName: 'Fallback',
        id: 'user_123',
        publicMetadata: {
          user: 'user_123',
        },
      });

      const result = controller.whoami(req);

      expect(result.data.user.email).toBe('fallback@example.com');
    });

    it('should keep mongo user id empty when publicMetadata.user is missing', () => {
      const req = buildReq({
        id: 'clerk_user_id',
        publicMetadata: {},
      });

      const result = controller.whoami(req);

      expect(result.data.user.id).toBe('');
      expect(result.data.user.clerkId).toBe('clerk_user_id');
    });

    it('should handle completely empty user object', () => {
      const req = buildReq({});

      const result = controller.whoami(req);

      expect(result.data.isApiKey).toBe(false);
      expect(result.data.organization.id).toBe('');
      expect(result.data.organization.name).toBe('');
      expect(result.data.scopes).toEqual(['*']);
      expect(result.data.user.email).toBe('');
      expect(result.data.user.id).toBe('');
      expect(result.data.user.clerkId).toBe('');
      expect(result.data.user.name).toBe('');
    });

    it('should handle undefined user gracefully', () => {
      const req = buildReq();

      // Access to undefined user returns defaults
      const result = controller.whoami(req);

      expect(result.data.isApiKey).toBe(false);
      expect(result.data.scopes).toEqual(['*']);
    });

    it('should return empty mongo user id when metadata user id is not a valid ObjectId', () => {
      const req = buildReq({
        id: 'clerk_user_id',
        publicMetadata: {
          user: 'user_123',
        },
      });

      const result = controller.whoami(req);

      expect(result.data.user.id).toBe('');
      expect(result.data.user.clerkId).toBe('clerk_user_id');
    });

    it('should trim name when lastName has trailing spaces', () => {
      const req = buildReq({
        emailAddresses: [],
        firstName: 'John',
        lastName: 'Doe  ',
        publicMetadata: {},
      });

      const result = controller.whoami(req);

      expect(result.data.user.name).toBe('John Doe');
    });

    it('should handle both firstName and empty lastName', () => {
      const req = buildReq({
        emailAddresses: [],
        firstName: 'Alice',
        lastName: '',
        publicMetadata: {},
      });

      const result = controller.whoami(req);

      expect(result.data.user.name).toBe('Alice');
    });

    it('should return default scopes as ["*"] when not provided', () => {
      const req = buildReq({
        id: 'user_123',
        publicMetadata: {
          organization: 'org_123',
        },
      });

      const result = controller.whoami(req);

      expect(result.data.scopes).toEqual(['*']);
    });
  });
});
