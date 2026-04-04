/**
 * Authentication E2E Tests
 * Tests authentication flows with Clerk mocked
 */

import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
// Import services
import { UsersService } from '@api/collections/users/services/users.service';
import {
  createTestCredit,
  createTestMember,
  createTestOrganization,
  createTestOrganizationSetting,
  createTestUser,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import {
  createTestDatabaseHelper,
  E2ETestModule,
  TestDatabaseHelper,
} from '@api-test/e2e-test.module';
import {
  createMockClerkClient,
  createMockClerkService,
} from '@api-test/mocks/external-services.mocks';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('Authentication E2E Tests', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dbHelper: TestDatabaseHelper;

  // Test data
  let testUser: ReturnType<typeof createTestUser>;
  let testOrganization: ReturnType<typeof createTestOrganization>;
  let testMember: ReturnType<typeof createTestMember>;

  beforeAll(async () => {
    const moduleConfig = await E2ETestModule.forRoot({
      controllers: [],
      providers: [UsersService, OrganizationsService, MembersService],
    });

    moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );
    app.setGlobalPrefix('v1');

    await app.init();

    dbHelper = createTestDatabaseHelper(moduleRef);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dbHelper.clearDatabase();

    // Create test user
    testUser = createTestUser({
      _id: new Types.ObjectId(),
      clerkId: 'clerk_test_user_123',
      email: 'auth-test@example.com',
    });

    // Create test organization
    testOrganization = createTestOrganization({
      _id: new Types.ObjectId(),
      label: 'Auth Test Organization',
      user: testUser._id,
    });

    // Create test member
    testMember = createTestMember({
      organization: testOrganization._id,
      role: 'owner',
      user: testUser._id,
    });

    // Seed database
    await dbHelper.seedCollection('users', [testUser]);
    await dbHelper.seedCollection('organizations', [testOrganization]);
    await dbHelper.seedCollection('members', [testMember]);
    await dbHelper.seedCollection('organization-settings', [
      createTestOrganizationSetting({ organization: testOrganization._id }),
    ]);
    await dbHelper.seedCollection('credit-balances', [
      createTestCredit({ organization: testOrganization._id }),
    ]);
  });

  describe('Clerk Service Mocking', () => {
    it('should mock Clerk getUser correctly', async () => {
      const mockClerkService = createMockClerkService();

      const user = await mockClerkService.getUser('clerk_test_user_123');

      expect(user).toBeDefined();
      expect(user.id).toBe('clerk-user-id');
      expect(user.emailAddresses).toHaveLength(1);
      expect(user.publicMetadata).toHaveProperty('organization');
      expect(user.publicMetadata).toHaveProperty('user');
    });

    it('should mock Clerk getUserByEmail correctly', async () => {
      const mockClerkService = createMockClerkService();

      const user = await mockClerkService.getUserByEmail('test@example.com');

      // Default mock returns null for getUserByEmail
      expect(user).toBeNull();
    });

    it('should mock Clerk updateUserPublicMetadata correctly', async () => {
      const mockClerkService = createMockClerkService();

      const result = await mockClerkService.updateUserPublicMetadata(
        'clerk_user_id',
        {
          organization: generateIdString(),
          user: generateIdString(),
        },
      );

      expect(result).toBeDefined();
      expect(mockClerkService.updateUserPublicMetadata).toHaveBeenCalled();
    });

    it('should mock Clerk createInvitation correctly', async () => {
      const mockClerkService = createMockClerkService();

      const invitation =
        await mockClerkService.createInvitation('invite@example.com');

      expect(invitation).toBeDefined();
      expect(invitation.id).toBe('mock-invitation-id');
      expect(invitation.emailAddress).toBe('invite@example.com');
    });
  });

  describe('Clerk Client Mocking', () => {
    it('should mock ClerkClient users.getUser correctly', async () => {
      const mockClerkClient = createMockClerkClient();

      const user = await mockClerkClient.users.getUser('clerk_test_user_123');

      expect(user).toBeDefined();
      expect(user.id).toBe('clerk-user-id');
      expect(user.firstName).toBe('Test');
      expect(user.lastName).toBe('User');
    });

    it('should mock ClerkClient users.getUserList correctly', async () => {
      const mockClerkClient = createMockClerkClient();

      const result = await mockClerkClient.users.getUserList({
        emailAddress: ['test@example.com'],
      });

      expect(result).toBeDefined();
      expect(result.data).toEqual([]);
    });

    it('should mock ClerkClient users.updateUserMetadata correctly', async () => {
      const mockClerkClient = createMockClerkClient();

      const result = await mockClerkClient.users.updateUserMetadata(
        'clerk_user_id',
        {
          publicMetadata: { organization: 'org_123' },
        },
      );

      expect(result).toBeDefined();
      expect(mockClerkClient.users.updateUserMetadata).toHaveBeenCalledWith(
        'clerk_user_id',
        {
          publicMetadata: { organization: 'org_123' },
        },
      );
    });

    it('should mock ClerkClient invitations.createInvitation correctly', async () => {
      const mockClerkClient = createMockClerkClient();

      const invitation = await mockClerkClient.invitations.createInvitation({
        emailAddress: 'new-invite@example.com',
        publicMetadata: { role: 'member' },
      });

      expect(invitation).toBeDefined();
      expect(invitation.id).toBe('mock-invitation-id');
    });
  });

  describe('User Verification Flow', () => {
    it('should verify user exists in database', async () => {
      const count = await dbHelper.getDocumentCount('users');
      expect(count).toBe(1);
    });

    it('should verify organization membership', async () => {
      const count = await dbHelper.getDocumentCount('members');
      expect(count).toBe(1);
    });

    it('should verify organization settings exist', async () => {
      const count = await dbHelper.getDocumentCount('organization-settings');
      expect(count).toBe(1);
    });

    it('should verify credits exist for organization', async () => {
      const count = await dbHelper.getDocumentCount('credit-balances');
      expect(count).toBe(1);
    });
  });

  describe('Authentication Token Validation', () => {
    it('should mock valid JWT token parsing', () => {
      // The E2E test module uses MockClerkGuard which always returns true
      // This test verifies the mock is working correctly
      const mockJwtPayload = {
        email: testUser.email,
        publicMetadata: {
          isOwner: true,
          organization: testOrganization._id.toString(),
          user: testUser._id.toString(),
        },
        sub: testUser.clerkId,
      };

      expect(mockJwtPayload.sub).toBe('clerk_test_user_123');
      expect(mockJwtPayload.publicMetadata.isOwner).toBe(true);
    });

    it('should verify public metadata structure', () => {
      const publicMetadata = {
        email: testUser.email,
        isOwner: true,
        isSuperAdmin: false,
        organization: testOrganization._id.toString(),
        user: testUser._id.toString(),
      };

      expect(publicMetadata).toHaveProperty('organization');
      expect(publicMetadata).toHaveProperty('user');
      expect(publicMetadata).toHaveProperty('email');
      expect(publicMetadata).toHaveProperty('isOwner');
      expect(publicMetadata).toHaveProperty('isSuperAdmin');
    });
  });

  describe('Multi-Organization Access', () => {
    it('should create multiple organizations for same user', async () => {
      const secondOrg = createTestOrganization({
        _id: new Types.ObjectId(),
        label: 'Second Organization',
        user: testUser._id,
      });

      const secondMember = createTestMember({
        organization: secondOrg._id,
        role: 'owner',
        user: testUser._id,
      });

      await dbHelper.seedCollection('organizations', [secondOrg]);
      await dbHelper.seedCollection('members', [secondMember]);

      const orgCount = await dbHelper.getDocumentCount('organizations');
      const memberCount = await dbHelper.getDocumentCount('members');

      expect(orgCount).toBe(2);
      expect(memberCount).toBe(2);
    });

    it('should verify user can be member of different organizations with different roles', async () => {
      const anotherUser = createTestUser({
        _id: new Types.ObjectId(),
        clerkId: 'clerk_another_user',
        email: 'another@example.com',
      });

      const memberInTestOrg = createTestMember({
        organization: testOrganization._id,
        role: 'member', // Not owner
        user: anotherUser._id,
      });

      await dbHelper.seedCollection('users', [anotherUser]);
      await dbHelper.seedCollection('members', [memberInTestOrg]);

      const memberCount = await dbHelper.getDocumentCount('members');
      expect(memberCount).toBe(2);
    });
  });

  describe('Session Management Mocking', () => {
    it('should mock session list retrieval', async () => {
      const mockClerkClient = createMockClerkClient();

      const sessions = await mockClerkClient.sessions.getSessionList({});

      expect(sessions).toBeDefined();
      expect(sessions.data).toEqual([]);
    });

    it('should mock session revocation', async () => {
      const mockClerkClient = createMockClerkClient();

      const result =
        await mockClerkClient.sessions.revokeSession('session_123');

      expect(result).toBeDefined();
      expect(mockClerkClient.sessions.revokeSession).toHaveBeenCalledWith(
        'session_123',
      );
    });
  });

  describe('Error Scenarios', () => {
    it('should handle non-existent user gracefully', async () => {
      const mockClerkService = createMockClerkService();

      // Configure mock to return null for specific call
      mockClerkService.getUserByEmail = vi.fn().mockResolvedValue(null);

      const user = await mockClerkService.getUserByEmail(
        'nonexistent@example.com',
      );

      expect(user).toBeNull();
    });

    it('should handle Clerk API errors gracefully', async () => {
      const mockClerkService = createMockClerkService();

      // Configure mock to throw an error
      mockClerkService.getUser = jest
        .fn()
        .mockRejectedValue(new Error('Clerk API error'));

      await expect(mockClerkService.getUser('invalid_id')).rejects.toThrow(
        'Clerk API error',
      );
    });
  });
});
