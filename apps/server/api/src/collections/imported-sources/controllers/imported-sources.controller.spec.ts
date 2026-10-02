import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '@api/auth/interfaces/authenticated-user.interface';
import { ImportedSourcesController } from '@api/collections/imported-sources/controllers/imported-sources.controller';
import { ImportedSourcesModule } from '@api/collections/imported-sources/imported-sources.module';
import { ImportedSourcesService } from '@api/collections/imported-sources/services/imported-sources.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import type { INestApplication } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const user: AuthenticatedUser = {
  id: 'provider-subject',
  userId: 'cuser12345678',
  organizationId: 'corganization123',
  brandId: 'cbrand12345678',
};
const input = {
  snapshot: {
    kind: 'page',
    canonicalUrl: 'https://example.com/page',
    title: 'Page',
    capturedText: 'Visible text',
    contentBasis: 'visible_page',
  },
};
const view = {
  id: 'csource123456',
  brandId: user.brandId,
  recordVersion: 1,
  identityDigest: 'a'.repeat(64),
  snapshot: {
    ...input.snapshot,
    capturedAt: '2026-01-01T00:00:00Z',
    captureSurface: 'extension',
    provenance: 'imported',
    evidenceAuthority: 'client_reported',
    host: 'example.com',
  },
  deduplicated: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const sources = {
  save: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  recapture: vi.fn(),
};
const guard = { canActivate: vi.fn(() => true) };
let app: INestApplication;
beforeEach(async () => {
  vi.clearAllMocks();
  guard.canActivate.mockReturnValue(true);
  sources.save.mockResolvedValue(view);
  sources.get.mockResolvedValue(view);
  sources.recapture.mockResolvedValue(view);
  sources.list.mockResolvedValue({
    docs: [view],
    totalDocs: 1,
    limit: 20,
    page: 1,
    totalPages: 1,
    pagingCounter: 1,
    hasPrevPage: false,
    hasNextPage: false,
    prevPage: null,
    nextPage: null,
  });
  const module = await Test.createTestingModule({
    controllers: [ImportedSourcesController],
    providers: [{ provide: ImportedSourcesService, useValue: sources }],
  })
    .overrideGuard(RolesGuard)
    .useValue(guard)
    .compile();
  app = module.createNestApplication();
  app.use(
    (
      req: Request & AuthenticatedRequest,
      _res: Response,
      next: NextFunction,
    ) => {
      req.user = user;
      next();
    },
  );
  app.useGlobalPipes(new ValidationPipe());
  await app.init();
});
afterEach(async () => {
  await app.close();
});
it('declares all four exact routes/statuses and organization membership guard, with only Prisma dependencies', () => {
  expect(Reflect.getMetadata(PATH_METADATA, ImportedSourcesController)).toBe(
    'brands/:brandId/imported-sources',
  );
  expect(
    Reflect.getMetadata(GUARDS_METADATA, ImportedSourcesController),
  ).toEqual([RolesGuard]);
  for (const [method, path, verb] of [
    ['save', '/', 1],
    ['list', '/', 0],
    ['get', ':id', 0],
    ['recapture', ':id/recaptures', 1],
  ] as const) {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        ImportedSourcesController.prototype[method],
      ),
    ).toBe(path);
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        ImportedSourcesController.prototype[method],
      ),
    ).toBe(verb);
  }
  expect(
    Reflect.getMetadata(
      HTTP_CODE_METADATA,
      ImportedSourcesController.prototype.save,
    ),
  ).toBe(201);
  expect(
    Reflect.getMetadata(
      HTTP_CODE_METADATA,
      ImportedSourcesController.prototype.recapture,
    ),
  ).toBe(201);
  expect(
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, ImportedSourcesModule),
  ).toEqual([PrismaModule]);
});
it('save and deduplicated save both return201 JSONAPI and forward only authenticated user/path brand', async () => {
  for (const deduplicated of [false, true]) {
    sources.save.mockResolvedValueOnce({ ...view, deduplicated });
    const response = await request(app.getHttpServer())
      .post(`/brands/${user.brandId}/imported-sources`)
      .send(input)
      .expect(201);
    expect(response.body.data).toMatchObject({
      id: view.id,
      type: 'imported-source',
      attributes: { deduplicated },
    });
  }
  expect(sources.save).toHaveBeenCalledWith(user, user.brandId, input);
  expect(guard.canActivate).toHaveBeenCalled();
});
it('list/get/recapture retain canonical pagination and exact unchanged path selectors', async () => {
  const base = `/brands/${user.brandId}/imported-sources`;
  const response = await request(app.getHttpServer()).get(base).expect(200);
  expect(response.body.links.pagination).toEqual({
    page: 1,
    limit: 20,
    total: 1,
    pages: 1,
  });
  expect(sources.list).toHaveBeenCalledWith(user, user.brandId, {
    page: 1,
    limit: 20,
  });
  await request(app.getHttpServer()).get(`${base}/${view.id}`).expect(200);
  expect(sources.get).toHaveBeenCalledWith(user, user.brandId, view.id);
  const body = { requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  await request(app.getHttpServer())
    .post(`${base}/${view.id}/recaptures`)
    .send(body)
    .expect(201);
  expect(sources.recapture).toHaveBeenCalledWith(
    user,
    user.brandId,
    view.id,
    body,
  );
});
it('strict DTOs reject unlisted outer fields, invalid query numbers and nonv4 recapture keys', async () => {
  const base = `/brands/${user.brandId}/imported-sources`;
  await request(app.getHttpServer())
    .post(base)
    .send({ ...input, organizationId: 'foreign' })
    .expect(400);
  await request(app.getHttpServer()).get(`${base}?isDeleted=true`).expect(400);
  await request(app.getHttpServer()).get(`${base}?limit=101`).expect(400);
  await request(app.getHttpServer())
    .post(`${base}/${view.id}/recaptures`)
    .send({ requestId: 'not-uuid' })
    .expect(400);
  expect(sources.save).not.toHaveBeenCalled();
  expect(sources.recapture).not.toHaveBeenCalled();
});
it('membership denial blocks persistence before service delegation', async () => {
  guard.canActivate.mockReturnValue(false);
  await request(app.getHttpServer())
    .post(`/brands/${user.brandId}/imported-sources`)
    .send(input)
    .expect(403);
  expect(sources.save).not.toHaveBeenCalled();
});
