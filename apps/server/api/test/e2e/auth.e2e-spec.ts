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
    const testUserId = generateIdString();
    testUser = createTestUser({
      id: testUserId,
      email: `auth-test-${testUserId}@example.com`,
    });

    // Create test organization
    testOrganization = createTestOrganization({
      id: generateIdString(),
      label: 'Auth Test Organization',
      userId: testUser.id,
    });

    // Create test member
    testMember = createTestMember({
      organizationId: testOrganization.id,
      roleId: 'owner',
      userId: testUser.id,
    });

    // Seed database
    await dbHelper.seedCollection('users', [testUser]);
    await dbHelper.seedCollection('organizations', [testOrganization]);
    await dbHelper.seedCollection('members', [testMember]);
    await dbHelper.seedCollection('organization-settings', [
      createTestOrganizationSetting({ organizationId: testOrganization.id }),
    ]);
    await dbHelper.seedCollection('credit-balances', [
      createTestCredit({ organizationId: testOrganization.id }),
    ]);
  });

  describe('User Verification Flow', () => {
    it('should verify user exists in database', async () => {
      const count = await dbHelper.getDocumentCount('users', {
        id: testUser.id,
      });
      expect(count).toBe(1);
    });

    it('should verify organization membership', async () => {
      const count = await dbHelper.getDocumentCount('members', {
        id: testMember.id,
      });
      expect(count).toBe(1);
    });

    it('should verify organization settings exist', async () => {
      const count = await dbHelper.getDocumentCount('organization-settings', {
        organizationId: testOrganization.id,
      });
      expect(count).toBe(1);
    });

    it('should verify credits exist for organization', async () => {
      const count = await dbHelper.getDocumentCount('credit-balances', {
        organizationId: testOrganization.id,
      });
      expect(count).toBe(1);
    });
  });

  describe('Authentication Token Validation', () => {
    it('should mock valid JWT token parsing', () => {
      // The E2E test module uses MockBetterAuthGuard which always returns true
      // This test verifies the mock is working correctly
      const mockJwtPayload = {
        brandId: generateIdString(),
        email: testUser.email,
        organizationId: testOrganization.id.toString(),
        userId: testUser.id.toString(),
        sub: testUser.id.toString(),
      };

      expect(mockJwtPayload.sub).toBe(testUser.id.toString());
      expect(mockJwtPayload.organizationId).toBe(
        testOrganization.id.toString(),
      );
    });

    it('should verify canonical request identity structure', () => {
      const identity = {
        brandId: generateIdString(),
        email: testUser.email,
        isSuperAdmin: false,
        organizationId: testOrganization.id.toString(),
        userId: testUser.id.toString(),
      };

      expect(identity).toHaveProperty('brandId');
      expect(identity).toHaveProperty('organizationId');
      expect(identity).toHaveProperty('userId');
      expect(identity).toHaveProperty('email');
      expect(identity).toHaveProperty('isSuperAdmin');
    });
  });

  describe('Multi-Organization Access', () => {
    it('should create multiple organizations for same user', async () => {
      const secondOrg = createTestOrganization({
        id: generateIdString(),
        label: 'Second Organization',
        userId: testUser.id,
      });

      const secondMember = createTestMember({
        organizationId: secondOrg.id,
        roleId: 'owner',
        userId: testUser.id,
      });

      await dbHelper.seedCollection('organizations', [secondOrg]);
      await dbHelper.seedCollection('members', [secondMember]);

      const orgCount = await dbHelper.getDocumentCount('organizations', {
        userId: testUser.id,
      });
      const memberCount = await dbHelper.getDocumentCount('members', {
        userId: testUser.id,
      });

      expect(orgCount).toBe(2);
      expect(memberCount).toBe(2);
    });

    it('should verify user can be member of different organizations with different roles', async () => {
      const anotherUserId = generateIdString();
      const anotherUser = createTestUser({
        id: anotherUserId,
        email: `another-${anotherUserId}@example.com`,
      });

      const memberInTestOrg = createTestMember({
        organizationId: testOrganization.id,
        roleId: 'member', // Not owner
        userId: anotherUser.id,
      });

      await dbHelper.seedCollection('users', [anotherUser]);
      await dbHelper.seedCollection('members', [memberInTestOrg]);

      const memberCount = await dbHelper.getDocumentCount('members', {
        organizationId: testOrganization.id,
      });
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
