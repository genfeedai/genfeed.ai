import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '@api/auth/interfaces/authenticated-user.interface';
import { ImportedSourceMediaController } from '@api/collections/imported-sources/controllers/imported-source-media.controller';
import { ImportedSourceMediaService } from '@api/collections/imported-sources/services/imported-source-media.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import type { INestApplication } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const user: AuthenticatedUser = {
  id: 'provider-subject',
  userId: 'cuser12345678',
  organizationId: 'corg12345678',
  brandId: 'cbrand12345678',
};
const view = {
  id: 'csource12345678',
  sourceId: 'csource12345678',
  sourceRecordVersion: 1,
  sourceIdentityDigest: 'a'.repeat(64),
  bindingRevision: 0,
  state: 'unavailable',
  canRetry: false,
  errorCode: 'SOURCE_MEDIA_UNAVAILABLE',
};
const media = { start: vi.fn(), observe: vi.fn(), retry: vi.fn() };
const guard = { canActivate: vi.fn(() => true) };
const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const path = '/brands/cbrand12345678/imported-sources/csource12345678/media';
let app: INestApplication;
beforeEach(async () => {
  vi.clearAllMocks();
  guard.canActivate.mockReturnValue(true);
  media.start.mockResolvedValue(view);
  media.observe.mockResolvedValue(view);
  media.retry.mockResolvedValue(view);
  const module = await Test.createTestingModule({
    controllers: [ImportedSourceMediaController],
    providers: [{ provide: ImportedSourceMediaService, useValue: media }],
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
it('declares three exact guarded200 routes with no update/delete endpoint', () => {
  expect(
    Reflect.getMetadata(PATH_METADATA, ImportedSourceMediaController),
  ).toBe('brands/:brandId/imported-sources/:id/media');
  expect(
    Reflect.getMetadata(GUARDS_METADATA, ImportedSourceMediaController),
  ).toEqual([RolesGuard]);
  for (const [method, route, verb] of [
    ['start', '/', 1],
    ['observe', '/', 0],
    ['retry', 'retry', 1],
  ] as const) {
    const fn = ImportedSourceMediaController.prototype[method];
    expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe(route);
    expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(verb);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, fn)).toBe(200);
  }
});
it('returns canonical source id and exact JSONAPI state for start/observe/retry', async () => {
  const first = await request(app.getHttpServer())
    .post(path)
    .send({ requestId })
    .expect(200);
  expect(first.body.data).toMatchObject({
    id: view.sourceId,
    type: 'imported-source-media',
    attributes: { state: 'unavailable', canRetry: false },
  });
  await request(app.getHttpServer()).get(path).expect(200);
  await request(app.getHttpServer())
    .post(`${path}/retry`)
    .send({ requestId, expectedIngestRevision: 1 })
    .expect(200);
  expect(media.start).toHaveBeenCalledWith(
    user,
    'cbrand12345678',
    view.sourceId,
    { requestId },
  );
  expect(media.observe).toHaveBeenCalledWith(
    user,
    'cbrand12345678',
    view.sourceId,
  );
  expect(media.retry).toHaveBeenCalledWith(
    user,
    'cbrand12345678',
    view.sourceId,
    { requestId, expectedIngestRevision: 1 },
  );
});
it('rejects malformed UUID, unknown caller authority and uncoerced retry revision', async () => {
  for (const body of [
    { requestId: 'bad' },
    { requestId, url: 'https://private.example' },
    { requestId, organizationId: user.organizationId },
  ])
    await request(app.getHttpServer()).post(path).send(body).expect(400);
  for (const expectedIngestRevision of [0, 1.5, '1'])
    await request(app.getHttpServer())
      .post(`${path}/retry`)
      .send({ requestId, expectedIngestRevision })
      .expect(400);
  expect(media.start).not.toHaveBeenCalled();
  expect(media.retry).not.toHaveBeenCalled();
});
it('denies inactive organization membership before any media operation', async () => {
  guard.canActivate.mockReturnValue(false);
  await request(app.getHttpServer()).post(path).send({ requestId }).expect(403);
  await request(app.getHttpServer()).get(path).expect(403);
  expect(media.start).not.toHaveBeenCalled();
  expect(media.observe).not.toHaveBeenCalled();
});
