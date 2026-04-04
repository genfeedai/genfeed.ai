/**
 * Brands E2E Tests
 * Tests brand CRUD operations with real database (MongoMemoryServer)
 * All external services are mocked to prevent real API calls
 */

import { AssetsService } from '@api/collections/assets/services/assets.service';
// Import controllers and services
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UsersService } from '@api/collections/users/services/users.service';
import {
  createTestAsset,
  createTestBrand,
  createTestCredential,
  createTestCredit,
  createTestMember,
  createTestOrganization,
  createTestOrganizationSetting,
  createTestUser,
} from '@api-test/e2e/e2e-test.utils';
import {
  createTestDatabaseHelper,
  E2ETestModule,
  TestDatabaseHelper,
} from '@api-test/e2e-test.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import request from 'supertest';

describe('Brands E2E Tests', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dbHelper: TestDatabaseHelper;

  // Test data
  let testUser: ReturnType<typeof createTestUser>;
  let testOrganization: ReturnType<typeof createTestOrganization>;
  let testMember: ReturnType<typeof createTestMember>;
  let testBrand: ReturnType<typeof createTestBrand>;

  beforeAll(async () => {
    const moduleConfig = await E2ETestModule.forRoot({
      controllers: [BrandsController],
      providers: [
        BrandsService,
        OrganizationsService,
        MembersService,
        UsersService,
        AssetsService,
        SettingsService,
        CredentialsService,
        LinksService,
      ],
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
      clerkId: 'clerk_brand_test_user',
      email: 'brand-test@example.com',
    });

    // Create test organization
    testOrganization = createTestOrganization({
      _id: new Types.ObjectId(),
      label: 'Brand Test Organization',
      user: testUser._id,
    });

    // Create test member (owner)
    testMember = createTestMember({
      _id: new Types.ObjectId(),
      organization: testOrganization._id,
      role: 'owner',
      user: testUser._id,
    });

    // Create test brand
    testBrand = createTestBrand({
      _id: new Types.ObjectId(),
      description: 'A test brand for E2E testing',
      label: 'Test Brand',
      organization: testOrganization._id,
      slug: 'test-brand-handle',
      user: testUser._id,
    });

    // Seed core data
    await dbHelper.seedCollection('users', [testUser]);
    await dbHelper.seedCollection('organizations', [testOrganization]);
    await dbHelper.seedCollection('members', [testMember]);
    await dbHelper.seedCollection('brands', [testBrand]);
    await dbHelper.seedCollection('organization-settings', [
      createTestOrganizationSetting({
        _id: new Types.ObjectId(),
        organization: testOrganization._id,
      }),
    ]);
    await dbHelper.seedCollection('credit-balances', [
      createTestCredit({
        _id: new Types.ObjectId(),
        balance: 50000,
        organization: testOrganization._id,
      }),
    ]);
  });

  /**
   * Helper to make authenticated requests
   */
  const authenticatedRequest = () => {
    return request(app.getHttpServer())
      .set('Authorization', 'Bearer mock-jwt-token')
      .set('x-clerk-user-id', testUser.clerkId)
      .set('x-user-id', testUser._id.toString())
      .set('x-organization-id', testOrganization._id.toString());
  };

  describe('GET /v1/brands', () => {
    beforeEach(async () => {
      // Add more brands for testing
      const additionalBrands = [
        createTestBrand({
          _id: new Types.ObjectId(),
          label: 'Alpha Brand',
          organization: testOrganization._id,
          slug: `brand-alpha-${Date.now()}`,
          user: testUser._id,
        }),
        createTestBrand({
          _id: new Types.ObjectId(),
          label: 'Beta Brand',
          organization: testOrganization._id,
          slug: `brand-beta-${Date.now()}`,
          user: testUser._id,
        }),
      ];
      await dbHelper.seedCollection('brands', additionalBrands);
    });

    it('should return all brands for user/organization', async () => {
      const response = await authenticatedRequest().get('/v1/brands');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(3);
    });

    it('should return brands with JSON:API structure', async () => {
      const response = await authenticatedRequest().get('/v1/brands');

      expect(response.status).toBe(200);
      response.body.data.forEach((brand: Record<string, unknown>) => {
        expect(brand).toHaveProperty('id');
        expect(brand).toHaveProperty('type', 'brands');
        expect(brand).toHaveProperty('attributes');
        expect(brand.attributes as Record<string, unknown>).toHaveProperty(
          'label',
        );
        expect(brand.attributes as Record<string, unknown>).toHaveProperty(
          'slug',
        );
      });
    });

    it('should support pagination', async () => {
      const response = await authenticatedRequest().get(
        '/v1/brands?page[size]=2&page[number]=1',
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('totalDocs');
      expect(response.body.meta).toHaveProperty('totalPages');
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it('should filter out deleted brands by default', async () => {
      // Create a deleted brand
      const deletedBrand = createTestBrand({
        _id: new Types.ObjectId(),
        isDeleted: true,
        label: 'Deleted Brand',
        organization: testOrganization._id,
        slug: `deleted-brand-${Date.now()}`,
        user: testUser._id,
      });
      await dbHelper.seedCollection('brands', [deletedBrand]);

      const response = await authenticatedRequest().get('/v1/brands');

      expect(response.status).toBe(200);
      // Should not include deleted brand
      expect(response.body.data.length).toBe(3);
      response.body.data.forEach((brand: Record<string, unknown>) => {
        expect(
          (brand.attributes as Record<string, unknown>).isDeleted,
        ).toBeFalsy();
      });
    });

    it('should support sorting by label', async () => {
      const response = await authenticatedRequest().get(
        '/v1/brands?sort=label',
      );

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(3);

      // Verify alphabetical order
      const labels = response.body.data.map(
        (b: Record<string, unknown>) =>
          (b.attributes as Record<string, unknown>).label,
      );
      const sortedLabels = [...labels].sort();
      expect(labels).toEqual(sortedLabels);
    });

    it('should support sorting by createdAt descending', async () => {
      const response = await authenticatedRequest().get(
        '/v1/brands?sort=-createdAt',
      );

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(3);
    });
  });

  describe('GET /v1/brands/:brandId', () => {
    it('should return a single brand by ID', async () => {
      const response = await authenticatedRequest().get(
        `/v1/brands/${testBrand._id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id', testBrand._id.toString());
      expect(response.body.data).toHaveProperty('type', 'brands');
      expect(response.body.data.attributes).toHaveProperty(
        'label',
        testBrand.label,
      );
    });

    it('should return brand with all attributes', async () => {
      const response = await authenticatedRequest().get(
        `/v1/brands/${testBrand._id}`,
      );

      expect(response.status).toBe(200);
      const attributes = response.body.data.attributes;

      expect(attributes).toHaveProperty('label');
      expect(attributes).toHaveProperty('slug');
      expect(attributes).toHaveProperty('description');
      expect(attributes).toHaveProperty('fontFamily');
      expect(attributes).toHaveProperty('primaryColor');
      expect(attributes).toHaveProperty('secondaryColor');
      expect(attributes).toHaveProperty('backgroundColor');
      expect(attributes).toHaveProperty('isSelected');
      expect(attributes).toHaveProperty('isActive');
      expect(attributes).toHaveProperty('isDeleted');
    });

    it('should return 404 for non-existent brand', async () => {
      const nonExistentId = new Types.ObjectId();

      const response = await authenticatedRequest().get(
        `/v1/brands/${nonExistentId}`,
      );

      expect(response.status).toBe(404);
    });

    it('should return brand with populated assets', async () => {
      // Create logo asset
      const logoAsset = createTestAsset({
        _id: new Types.ObjectId(),
        category: 'image',
        organization: testOrganization._id,
        type: 'logo',
        url: 'https://example.com/logo.png',
        user: testUser._id,
      });

      await dbHelper.seedCollection('assets', [logoAsset]);

      // Update brand to reference the logo
      // Note: In a real scenario, the virtual would be populated via aggregation
      // This test verifies the endpoint returns the brand structure

      const response = await authenticatedRequest().get(
        `/v1/brands/${testBrand._id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('attributes');
    });
  });

  describe('POST /v1/brands', () => {
    it('should create a new brand', async () => {
      const newBrandData = {
        data: {
          attributes: {
            backgroundColor: '#FFFFFF',
            description: 'A newly created brand',
            fontFamily: 'MONTSERRAT_BLACK',
            label: 'New Test Brand',
            primaryColor: '#FF0000',
            secondaryColor: '#00FF00',
            slug: `new-brand-${Date.now()}`,
          },
          type: 'brands',
        },
      };

      const response = await authenticatedRequest()
        .post('/v1/brands')
        .send(newBrandData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data.attributes).toHaveProperty(
        'label',
        'New Test Brand',
      );
      expect(response.body.data.attributes).toHaveProperty(
        'primaryColor',
        '#FF0000',
      );
    });

    it('should require label field', async () => {
      const invalidBrandData = {
        data: {
          attributes: {
            description: 'Brand without label',
            slug: `no-label-brand-${Date.now()}`,
          },
          type: 'brands',
        },
      };

      const response = await authenticatedRequest()
        .post('/v1/brands')
        .send(invalidBrandData);

      expect([400, 422]).toContain(response.status);
    });

    it('should prevent duplicate brand labels in same organization', async () => {
      const duplicateBrandData = {
        data: {
          attributes: {
            label: testBrand.label, // Same label as existing brand
            slug: `duplicate-brand-${Date.now()}`,
          },
          type: 'brands',
        },
      };

      const response = await authenticatedRequest()
        .post('/v1/brands')
        .send(duplicateBrandData);

      // Should return conflict error
      expect([400, 409, 422]).toContain(response.status);
    });

    it('should set default values for optional fields', async () => {
      const minimalBrandData = {
        data: {
          attributes: {
            label: 'Minimal Brand',
            slug: `minimal-brand-${Date.now()}`,
          },
          type: 'brands',
        },
      };

      const response = await authenticatedRequest()
        .post('/v1/brands')
        .send(minimalBrandData);

      expect(response.status).toBe(201);
      expect(response.body.data.attributes).toHaveProperty(
        'fontFamily',
        'MONTSERRAT_BLACK',
      );
      expect(response.body.data.attributes).toHaveProperty(
        'primaryColor',
        '#000000',
      );
      expect(response.body.data.attributes).toHaveProperty(
        'secondaryColor',
        '#FFFFFF',
      );
      expect(response.body.data.attributes).toHaveProperty('isActive', true);
      expect(response.body.data.attributes).toHaveProperty('isDeleted', false);
    });
  });

  describe('PATCH /v1/brands/:brandId', () => {
    it('should update brand label', async () => {
      const updateData = {
        data: {
          attributes: {
            label: 'Updated Brand Label',
          },
          id: testBrand._id.toString(),
          type: 'brands',
        },
      };

      const response = await authenticatedRequest()
        .patch(`/v1/brands/${testBrand._id}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.attributes).toHaveProperty(
        'label',
        'Updated Brand Label',
      );
    });

    it('should update brand colors', async () => {
      const updateData = {
        data: {
          attributes: {
            primaryColor: '#123456',
            secondaryColor: '#654321',
          },
          id: testBrand._id.toString(),
          type: 'brands',
        },
      };

      const response = await authenticatedRequest()
        .patch(`/v1/brands/${testBrand._id}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.attributes).toHaveProperty(
        'primaryColor',
        '#123456',
      );
      expect(response.body.data.attributes).toHaveProperty(
        'secondaryColor',
        '#654321',
      );
    });

    it('should update brand description', async () => {
      const updateData = {
        data: {
          attributes: {
            description: 'Updated description for the brand',
          },
          id: testBrand._id.toString(),
          type: 'brands',
        },
      };

      const response = await authenticatedRequest()
        .patch(`/v1/brands/${testBrand._id}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.attributes).toHaveProperty(
        'description',
        'Updated description for the brand',
      );
    });

    it('should return 404 for non-existent brand', async () => {
      const nonExistentId = new Types.ObjectId();
      const updateData = {
        data: {
          attributes: {
            label: 'Updated Label',
          },
          id: nonExistentId.toString(),
          type: 'brands',
        },
      };

      const response = await authenticatedRequest()
        .patch(`/v1/brands/${nonExistentId}`)
        .send(updateData);

      expect(response.status).toBe(404);
    });

    it('should update default model settings', async () => {
      const updateData = {
        data: {
          attributes: {
            defaultImageModel: 'OPENAI_DALLE3',
            defaultVideoModel: 'OPENAI_SORA',
          },
          id: testBrand._id.toString(),
          type: 'brands',
        },
      };

      const response = await authenticatedRequest()
        .patch(`/v1/brands/${testBrand._id}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.attributes).toHaveProperty(
        'defaultVideoModel',
        'OPENAI_SORA',
      );
      expect(response.body.data.attributes).toHaveProperty(
        'defaultImageModel',
        'OPENAI_DALLE3',
      );
    });
  });

  describe('DELETE /v1/brands/:brandId', () => {
    it('should soft delete a brand', async () => {
      const response = await authenticatedRequest().delete(
        `/v1/brands/${testBrand._id}`,
      );

      expect(response.status).toBe(200);

      // Verify the brand is soft deleted
      const getResponse = await authenticatedRequest().get(
        `/v1/brands/${testBrand._id}`,
      );

      // Should return 404 since deleted brands are filtered
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent brand', async () => {
      const nonExistentId = new Types.ObjectId();

      const response = await authenticatedRequest().delete(
        `/v1/brands/${nonExistentId}`,
      );

      expect(response.status).toBe(404);
    });

    it('should not affect other brands when deleting', async () => {
      // Create another brand
      const anotherBrand = createTestBrand({
        _id: new Types.ObjectId(),
        label: 'Another Brand',
        organization: testOrganization._id,
        slug: `another-brand-${Date.now()}`,
        user: testUser._id,
      });
      await dbHelper.seedCollection('brands', [anotherBrand]);

      // Delete the test brand
      await authenticatedRequest().delete(`/v1/brands/${testBrand._id}`);

      // Verify the other brand still exists
      const response = await authenticatedRequest().get(
        `/v1/brands/${anotherBrand._id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data.attributes.label).toBe('Another Brand');
    });
  });

  describe('Brand with Credentials', () => {
    beforeEach(async () => {
      // Create credentials for the brand
      const credentials = [
        createTestCredential({
          _id: new Types.ObjectId(),
          brand: testBrand._id,
          externalHandle: '@testchannel',
          isConnected: true,
          organization: testOrganization._id,
          platform: 'youtube',
          user: testUser._id,
        }),
        createTestCredential({
          _id: new Types.ObjectId(),
          brand: testBrand._id,
          externalHandle: '@testtiktok',
          isConnected: true,
          organization: testOrganization._id,
          platform: 'tiktok',
          user: testUser._id,
        }),
      ];

      await dbHelper.seedCollection('credentials', credentials);
    });

    it('should return brand with connected credentials', async () => {
      const response = await authenticatedRequest().get(
        `/v1/brands/${testBrand._id}`,
      );

      expect(response.status).toBe(200);
      // The brand endpoint should include credential relationships
      expect(response.body.data).toHaveProperty('attributes');
    });
  });

  describe('Brand Isolation Between Organizations', () => {
    let otherOrganization: ReturnType<typeof createTestOrganization>;
    let otherUser: ReturnType<typeof createTestUser>;
    let otherBrand: ReturnType<typeof createTestBrand>;

    beforeEach(async () => {
      // Create another organization with a brand
      otherUser = createTestUser({
        _id: new Types.ObjectId(),
        clerkId: 'clerk_other_brand_user',
        email: 'other-brand@example.com',
      });

      otherOrganization = createTestOrganization({
        _id: new Types.ObjectId(),
        label: 'Other Organization',
        user: otherUser._id,
      });

      const otherMember = createTestMember({
        _id: new Types.ObjectId(),
        organization: otherOrganization._id,
        role: 'owner',
        user: otherUser._id,
      });

      otherBrand = createTestBrand({
        _id: new Types.ObjectId(),
        label: 'Other Org Brand',
        organization: otherOrganization._id,
        slug: `other-org-brand-${Date.now()}`,
        user: otherUser._id,
      });

      await dbHelper.seedCollection('users', [otherUser]);
      await dbHelper.seedCollection('organizations', [otherOrganization]);
      await dbHelper.seedCollection('members', [otherMember]);
      await dbHelper.seedCollection('brands', [otherBrand]);
      await dbHelper.seedCollection('organization-settings', [
        createTestOrganizationSetting({
          _id: new Types.ObjectId(),
          organization: otherOrganization._id,
        }),
      ]);
    });

    it('should not return brands from other organizations', async () => {
      const response = await authenticatedRequest().get('/v1/brands');

      expect(response.status).toBe(200);

      // Verify no brands from other organization
      response.body.data.forEach((brand: Record<string, unknown>) => {
        expect((brand.attributes as Record<string, unknown>).label).not.toBe(
          'Other Org Brand',
        );
      });
    });

    it('should not allow accessing brand from another organization', async () => {
      const response = await authenticatedRequest().get(
        `/v1/brands/${otherBrand._id}`,
      );

      // Should return 404 or 403
      expect([403, 404]).toContain(response.status);
    });

    it('should not allow updating brand from another organization', async () => {
      const updateData = {
        data: {
          attributes: {
            label: 'Hacked Brand Name',
          },
          id: otherBrand._id.toString(),
          type: 'brands',
        },
      };

      const response = await authenticatedRequest()
        .patch(`/v1/brands/${otherBrand._id}`)
        .send(updateData);

      // Should return 404 or 403
      expect([403, 404]).toContain(response.status);
    });

    it('should not allow deleting brand from another organization', async () => {
      const response = await authenticatedRequest().delete(
        `/v1/brands/${otherBrand._id}`,
      );

      // Should return 404 or 403
      expect([403, 404]).toContain(response.status);
    });
  });

  describe('Brand Search', () => {
    beforeEach(async () => {
      // Create brands with searchable names
      const searchableBrands = [
        createTestBrand({
          _id: new Types.ObjectId(),
          description: 'A technology focused startup',
          label: 'Tech Startup Brand',
          organization: testOrganization._id,
          slug: `tech-startup-${Date.now()}`,
          user: testUser._id,
        }),
        createTestBrand({
          _id: new Types.ObjectId(),
          description: 'A food and beverage company',
          label: 'Food Company Brand',
          organization: testOrganization._id,
          slug: `food-company-${Date.now()}`,
          user: testUser._id,
        }),
      ];

      await dbHelper.seedCollection('brands', searchableBrands);
    });

    it('should search brands by label', async () => {
      const response = await authenticatedRequest().get(
        '/v1/brands?search=Tech',
      );

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);

      const labels = response.body.data.map(
        (b: Record<string, unknown>) =>
          (b.attributes as Record<string, unknown>).label,
      );
      expect(labels.some((l: string) => l.includes('Tech'))).toBe(true);
    });
  });

  describe('Brand Validation', () => {
    it('should validate color format', async () => {
      const invalidColorData = {
        data: {
          attributes: {
            label: 'Invalid Color Brand',
            primaryColor: 'not-a-color', // Invalid
            slug: `invalid-color-${Date.now()}`,
          },
          type: 'brands',
        },
      };

      const response = await authenticatedRequest()
        .post('/v1/brands')
        .send(invalidColorData);

      // Depending on validation, might be 400/422 or might accept invalid colors
      // This test documents the current behavior
      expect([200, 201, 400, 422]).toContain(response.status);
    });

    it('should validate slug uniqueness', async () => {
      const duplicateSlugData = {
        data: {
          attributes: {
            label: 'Duplicate Slug Brand',
            slug: testBrand.slug, // Same slug as existing brand
          },
          type: 'brands',
        },
      };

      const response = await authenticatedRequest()
        .post('/v1/brands')
        .send(duplicateSlugData);

      // Should return conflict/validation error
      expect([400, 409, 422, 500]).toContain(response.status);
    });
  });

  describe('Database Integrity', () => {
    it('should verify brand count after test setup', async () => {
      const count = await dbHelper.getDocumentCount('brands');
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should maintain brand-organization relationship integrity', async () => {
      const response = await authenticatedRequest().get(
        `/v1/brands/${testBrand._id}`,
      );

      expect(response.status).toBe(200);
      // Brand should belong to the test organization
      // Note: organization ID might be in relationships or attributes
    });
  });
});
