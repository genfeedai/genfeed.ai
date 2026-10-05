import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsOperationsController } from '@api/collections/ingredients/controllers/ingredients-operations.controller';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { CacheService } from '@api/services/cache/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { createIngredientDocumentFixture } from '@api-test/fixtures/ingredient-document.fixture';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { IngredientBulkDeleteSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import type { INestApplication } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

type AssetRow = {
  id: string;
  organizationId: string;
  userId: string;
  brandId: string;
  scope: AssetScope;
  isDeleted: boolean;
  category: IngredientCategory;
  status: IngredientStatus;
  s3Key?: string;
  metadataId: string;
  metadata: { id: string; label: string };
};

const organizationId = testId('org');
const brandId = testId('brand');
const canonicalUserId = testId('user');
const ingredientId = testId('ingredient');
const metadataId = testId('metadata');
const user: AuthenticatedUser = {
  id: 'jwt-subject',
  userId: canonicalUserId,
  organizationId,
  brandId,
};

function asset(id: string, overrides: Partial<AssetRow> = {}): AssetRow {
  return {
    id,
    organizationId,
    brandId,
    userId: canonicalUserId,
    scope: AssetScope.USER,
    isDeleted: false,
    category: IngredientCategory.IMAGE,
    status: IngredientStatus.GENERATED,
    s3Key: 'ingredients/images/random-source',
    metadataId,
    metadata: { id: metadataId, label: 'Original' },
    ...overrides,
  };
}

describe('Ingredients operations registered HTTP boundary', () => {
  let app: INestApplication;
  let rows: AssetRow[];
  let service: IngredientsService;
  const findMany = vi.fn();
  const updateMany = vi.fn();
  const invalidateByTags = vi.fn();
  const metadataPatch = vi.fn();
  const createMediaDocuments = vi.fn();
  const extractMetadataFromUrl = vi.fn();
  const getPresignedDownloadUrlForObjectKey = vi.fn();
  const uploadToS3 = vi.fn();
  const publishIngredientStatus = vi.fn();
  const config = {
    ingredientsEndpoint: 'https://media.test',
    isAuthorizedMediaDeliveryEnabled: false,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    rows = [asset(ingredientId)];
    config.isAuthorizedMediaDeliveryEnabled = false;
    invalidateByTags.mockReset().mockResolvedValue(1);
    metadataPatch.mockImplementation(async (_id, data) => {
      Object.assign(rows[0].metadata, data);
      return rows[0].metadata;
    });
    getPresignedDownloadUrlForObjectKey.mockResolvedValue(
      'https://signed.test/source',
    );
    extractMetadataFromUrl.mockResolvedValue({
      width: 100,
      height: 100,
      size: 100,
    });
    uploadToS3.mockResolvedValue({
      width: 100,
      height: 100,
      size: 100,
      s3Key: 'ingredients/images/clone',
    });
    publishIngredientStatus.mockResolvedValue(undefined);
    createMediaDocuments.mockResolvedValue({
      ingredientData: asset(testId('ingredient', 2)),
      metadataData: { id: testId('metadata', 2) },
    });
    const assertScope = (args: unknown, operation: string) =>
      runWithTenantContext({ organizationId }, () =>
        assertTenantScopedQuery({
          args,
          operation,
          model: 'Ingredient',
          tenantModelNames: new Set(['Ingredient']),
          isCloud: true,
        }),
      );
    findMany.mockImplementation(async (args) => {
      assertScope(args, 'findMany');
      return rows.filter(
        (row) =>
          args.where.id.in.includes(row.id) &&
          row.organizationId === args.where.organizationId &&
          row.isDeleted === args.where.isDeleted,
      );
    });
    updateMany.mockImplementation(async (args) => {
      assertScope(args, 'updateMany');
      let count = 0;
      for (const row of rows) {
        if (
          args.where.id.in.includes(row.id) &&
          row.organizationId === args.where.organizationId &&
          row.isDeleted === args.where.isDeleted
        ) {
          row.isDeleted = args.data.isDeleted;
          count += 1;
        }
      }
      return { count };
    });
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      IngredientsModule,
    ) as Array<typeof IngredientsOperationsController>;
    expect(
      controllers.filter(
        (controller) => controller === IngredientsOperationsController,
      ),
    ).toHaveLength(1);
    const module = await Test.createTestingModule({
      controllers: controllers.filter(
        (controller) => controller === IngredientsOperationsController,
      ),
      providers: [
        IngredientsService,
        AssetAccessGuard,
        {
          provide: PrismaService,
          useValue: { ingredient: { findMany, updateMany } },
        },
        { provide: ConfigService, useValue: config },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        },
        { provide: MetadataService, useValue: { patch: metadataPatch } },
        {
          provide: MembersService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({ id: 'membership' }),
          },
        },
        { provide: CacheService, useValue: { invalidateByTags } },
        { provide: SharedService, useValue: { createMediaDocuments } },
        {
          provide: FilesClientService,
          useValue: {
            extractMetadataFromUrl,
            getPresignedDownloadUrlForObjectKey,
            uploadToS3,
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: { publishIngredientStatus },
        },
      ],
    }).compile();
    service = module.get(IngredientsService);
    vi.spyOn(service, 'findOne').mockImplementation(async (where) => {
      const row = rows.find(
        (candidate) =>
          candidate.id === where.id &&
          !candidate.isDeleted &&
          (!where.organizationId ||
            candidate.organizationId === where.organizationId),
      );
      return row ? createIngredientDocumentFixture(row) : null;
    });
    vi.spyOn(service, 'patch').mockResolvedValue(
      createIngredientDocumentFixture(rows[0]),
    );
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (!req.headers['x-anonymous']) req.user = user;
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('deletes editable live assets only within the active organization through the real service', async () => {
    const privateId = testId('ingredient', 3);
    const foreignId = testId('ingredient', 4);
    const deletedId = testId('ingredient', 5);
    const otherBrandId = testId('ingredient', 6);
    const sharedId = testId('ingredient', 7);
    rows.push(
      asset(privateId, { userId: testId('user', 2) }),
      asset(foreignId, { organizationId: testId('org', 2) }),
      asset(deletedId, { isDeleted: true }),
      asset(otherBrandId, {
        scope: AssetScope.BRAND,
        brandId: testId('brand', 2),
        userId: testId('user', 2),
      }),
      asset(sharedId, {
        scope: AssetScope.ORGANIZATION,
        userId: testId('user', 2),
      }),
    );
    const ids = [
      ingredientId,
      privateId,
      foreignId,
      deletedId,
      otherBrandId,
      sharedId,
      'missing',
    ];
    const response = await request(app.getHttpServer())
      .delete('/ingredients')
      .send(IngredientBulkDeleteSerializer.serialize({ ids }))
      .expect(200);
    expect(response.body.deleted).toEqual([ingredientId, sharedId]);
    expect(response.body.failed).toEqual([
      privateId,
      foreignId,
      deletedId,
      otherBrandId,
      'missing',
    ]);
    expect(rows.find((row) => row.id === foreignId)?.isDeleted).toBe(false);
    expect(rows.find((row) => row.id === privateId)?.isDeleted).toBe(false);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ids }, organizationId, isDeleted: false },
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: {
        id: { in: [ingredientId, sharedId] },
        organizationId,
        isDeleted: false,
      },
    });
    expect(invalidateByTags).toHaveBeenCalledWith(['ingredients']);
  });

  it('supports plain bulk bodies and does not fail a successful write when cache is unavailable', async () => {
    invalidateByTags.mockRejectedValueOnce(new Error('cache unavailable'));
    await request(app.getHttpServer())
      .delete('/ingredients')
      .send({ ids: [ingredientId] })
      .expect(200);
    expect(rows[0].isDeleted).toBe(true);
  });

  it('rejects oversized and malformed bulk bodies before the database', async () => {
    await request(app.getHttpServer())
      .delete('/ingredients')
      .send({ ids: Array.from({ length: 101 }, (_, i) => `id-${i}`) })
      .expect(400);
    await request(app.getHttpServer())
      .delete('/ingredients')
      .send({ ids: [1] })
      .expect(400);
    expect(findMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('keeps empty bulk selections as a no-op', async () => {
    const response = await request(app.getHttpServer())
      .delete('/ingredients')
      .send({ ids: [] })
      .expect(200);
    expect(response.body.deleted).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    expect(invalidateByTags).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated writes through RolesGuard', async () => {
    await request(app.getHttpServer())
      .delete('/ingredients')
      .set('x-anonymous', '1')
      .send({ ids: [ingredientId] })
      .expect(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('removes unused analytics', async () => {
    await request(app.getHttpServer())
      .get('/ingredients/analytics')
      .expect(404);
  });

  it('serves clone with scoped source reads and canonical notification identity', async () => {
    const response = await request(app.getHttpServer())
      .post(`/ingredients/${ingredientId}/clone`)
      .expect(201);
    expect(response.body.data.id).toBe(testId('ingredient', 2));
    expect(service.findOne).toHaveBeenCalledWith(
      { id: ingredientId, organizationId, isDeleted: false },
      expect.any(Array),
    );
    await vi.waitFor(() =>
      expect(publishIngredientStatus).toHaveBeenCalledWith(
        testId('ingredient', 2),
        IngredientStatus.GENERATED,
        canonicalUserId,
        expect.any(Object),
      ),
    );
    expect(invalidateByTags).toHaveBeenCalledWith(['ingredients']);
    expect(invalidateByTags).toHaveBeenCalledTimes(2);
    expect(invalidateByTags.mock.invocationCallOrder[1]).toBeGreaterThan(
      vi.mocked(service.patch).mock.invocationCallOrder[0],
    );
    expect(invalidateByTags.mock.invocationCallOrder[1]).toBeLessThan(
      publishIngredientStatus.mock.invocationCallOrder[0],
    );
  });

  it('invalidates the Library after a clone fails before publishing failure', async () => {
    uploadToS3.mockRejectedValueOnce(new Error('upload failed'));
    await request(app.getHttpServer())
      .post(`/ingredients/${ingredientId}/clone`)
      .expect(201);
    await vi.waitFor(() =>
      expect(publishIngredientStatus).toHaveBeenCalledWith(
        testId('ingredient', 2),
        IngredientStatus.FAILED,
        canonicalUserId,
        expect.any(Object),
      ),
    );
    expect(service.patch).toHaveBeenCalledWith(testId('ingredient', 2), {
      status: IngredientStatus.FAILED,
    });
    expect(invalidateByTags).toHaveBeenCalledTimes(2);
    expect(invalidateByTags.mock.invocationCallOrder[1]).toBeLessThan(
      publishIngredientStatus.mock.invocationCallOrder[0],
    );
  });

  it('does not fail a generated clone when completion cache invalidation fails', async () => {
    invalidateByTags
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('cache unavailable'));
    await request(app.getHttpServer())
      .post(`/ingredients/${ingredientId}/clone`)
      .expect(201);
    await vi.waitFor(() =>
      expect(publishIngredientStatus).toHaveBeenCalledWith(
        testId('ingredient', 2),
        IngredientStatus.GENERATED,
        canonicalUserId,
        expect.any(Object),
      ),
    );
    expect(service.patch).not.toHaveBeenCalledWith(testId('ingredient', 2), {
      status: IngredientStatus.FAILED,
    });
  });

  it('refuses a same-user foreign-organization clone before creation', async () => {
    rows[0].organizationId = testId('org', 2);
    rows[0].scope = AssetScope.PUBLIC;
    await request(app.getHttpServer())
      .post(`/ingredients/${ingredientId}/clone`)
      .expect(404);
    expect(createMediaDocuments).not.toHaveBeenCalled();
  });

  it('strips server-owned metadata fields and returns the refreshed ingredient', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/ingredients/${ingredientId}/metadata`)
      .send({
        data: {
          type: 'metadata',
          attributes: {
            label: 'Updated',
            promptId: testId('prompt'),
            result: 'https://attacker.test',
            width: 123,
            isDeleted: true,
          },
        },
      })
      .expect(200);
    expect(metadataPatch).toHaveBeenCalledWith(metadataId, {
      label: 'Updated',
    });
    expect(response.body.data.id).toBe(ingredientId);
    expect(response.body.data.type).toBe('ingredient');
    expect(invalidateByTags).toHaveBeenCalledWith(['ingredients']);
  });

  it('keeps existing unbounded metadata values editable', async () => {
    const fields = { label: 'x'.repeat(201), description: 'y'.repeat(2001) };
    await request(app.getHttpServer())
      .patch(`/ingredients/${ingredientId}/metadata`)
      .send(fields)
      .expect(200);
    expect(metadataPatch).toHaveBeenCalledWith(metadataId, fields);
  });

  it('refuses metadata edits on another user’s private asset through AssetAccessGuard', async () => {
    rows[0].userId = testId('user', 2);
    await request(app.getHttpServer())
      .patch(`/ingredients/${ingredientId}/metadata`)
      .send({ label: 'Forbidden' })
      .expect(403);
    expect(metadataPatch).not.toHaveBeenCalled();
  });

  it('refuses same-user foreign metadata edits even when the access guard allows public assets', async () => {
    rows[0].organizationId = testId('org', 2);
    rows[0].scope = AssetScope.PUBLIC;
    await request(app.getHttpServer())
      .patch(`/ingredients/${ingredientId}/metadata`)
      .send({ label: 'Forbidden' })
      .expect(404);
    expect(metadataPatch).not.toHaveBeenCalled();
  });

  it('refreshes metadata through a presigned stored key with authorized delivery enabled', async () => {
    config.isAuthorizedMediaDeliveryEnabled = true;
    const response = await request(app.getHttpServer())
      .post(`/ingredients/${ingredientId}/metadata`)
      .expect(201);
    expect(response.body.data.id).toBe(ingredientId);
    expect(getPresignedDownloadUrlForObjectKey).toHaveBeenCalledWith(
      'ingredients/images/random-source',
    );
    expect(extractMetadataFromUrl).toHaveBeenCalledWith(
      'https://signed.test/source',
    );
    expect(service.findOne).toHaveBeenLastCalledWith(
      { id: ingredientId, organizationId, isDeleted: false },
      expect.any(Array),
    );
    expect(invalidateByTags).toHaveBeenCalledWith(['ingredients']);
    expect(invalidateByTags.mock.invocationCallOrder[0]).toBeGreaterThan(
      metadataPatch.mock.invocationCallOrder[0],
    );
  });

  it('keeps metadata refresh successful when cache invalidation fails', async () => {
    invalidateByTags.mockRejectedValueOnce(new Error('cache unavailable'));
    await request(app.getHttpServer())
      .post(`/ingredients/${ingredientId}/metadata`)
      .expect(201);
    expect(metadataPatch).toHaveBeenCalled();
  });

  it('fails a keyless refresh before any media request with authorized delivery enabled', async () => {
    config.isAuthorizedMediaDeliveryEnabled = true;
    delete rows[0].s3Key;
    await request(app.getHttpServer())
      .post(`/ingredients/${ingredientId}/metadata`)
      .expect(500);
    expect(extractMetadataFromUrl).not.toHaveBeenCalled();
    expect(metadataPatch).not.toHaveBeenCalled();
    expect(invalidateByTags).not.toHaveBeenCalled();
  });
});
