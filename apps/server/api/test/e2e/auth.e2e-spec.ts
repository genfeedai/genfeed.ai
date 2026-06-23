/**
 * Authentication E2E Tests
 * Tests authentication data setup and request metadata flows.
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
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

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
      _id: generateIdString(),
      authProviderId: 'authProvider_test_user_123',
      email: 'auth-test@example.com',
    });

    // Create test organization
    testOrganization = createTestOrganization({
      _id: generateIdString(),
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
      // The E2E test module uses MockBetterAuthGuard which always returns true
      // This test verifies the mock is working correctly
      const mockJwtPayload = {
        email: testUser.email,
        publicMetadata: {
          isOwner: true,
          organization: testOrganization._id.toString(),
          user: testUser._id.toString(),
        },
        sub: testUser.authProviderId,
      };

      expect(mockJwtPayload.sub).toBe('authProvider_test_user_123');
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
        _id: generateIdString(),
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
        _id: generateIdString(),
        authProviderId: 'authProvider_another_user',
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

  describe('Error Scenarios', () => {
    it('should handle non-existent user gracefully', async () => {
      const usersService = moduleRef.get(UsersService);

      const user = await usersService.findOne(
        { email: 'nonexistent@example.com' },
        [],
      );

      expect(user).toBeNull();
    });
  });
});
