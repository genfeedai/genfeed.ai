import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandFontAssetsController } from '@api/collections/brands/controllers/brand-font-assets.controller';
import { BrandFontAssetsService } from '@api/collections/brands/services/brand-font-assets.service';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { MemberRole } from '@genfeedai/contracts';
import type { INestApplication } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FontRequest extends Request {
  user?: AuthenticatedUser;
}
const brandId = 'cmfontbrand000000000000001';
const user: AuthenticatedUser = {
  id: 'legacy',
  userId: 'cmfontuser0000000000000001',
  organizationId: 'cmfontorg00000000000000001',
  brandId,
};
const row = {
  id: 'cmfontasset000000000000001',
  parentBrandId: brandId,
  parentOrgId: user.organizationId,
  userId: user.userId,
  category: 'FONT',
  mimeType: 'font/woff2',
  sha256: 'a'.repeat(64),
  sizeBytes: 48,
  displayName: null,
  originalFileName: 'Acme.woff2',
  cloudObjectKey: 'private',
  isDeleted: false,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
};
describe('Font dedicated HTTP controller', () => {
  let app: INestApplication;
  let trusted = user;
  const fonts = { list: vi.fn(), upload: vi.fn(), remove: vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks();
    trusted = user;
    fonts.list.mockResolvedValue({
      docs: [row],
      limit: 20,
      hasMore: false,
      nextCursor: null,
    });
    fonts.upload.mockResolvedValue({ asset: row, created: true });
    fonts.remove.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      controllers: [BrandFontAssetsController],
      providers: [{ provide: BrandFontAssetsService, useValue: fonts }],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.use((req: FontRequest, _res: Response, next: NextFunction) => {
      req.user = trusted;
      next();
    });
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  it('declares exact membership/write guards and delete status', () => {
    expect(Reflect.getMetadata(PATH_METADATA, BrandFontAssetsController)).toBe(
      'brands/:brandId/font-assets',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, BrandFontAssetsController),
    ).toContain(RolesGuard);
    for (const method of ['upload', 'remove'] as const)
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          BrandFontAssetsController.prototype[method],
        ),
      ).toEqual([MemberRole.OWNER, MemberRole.ADMIN]);
    expect(
      Reflect.getMetadata(ROLES_KEY, BrandFontAssetsController.prototype.list),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        BrandFontAssetsController.prototype.remove,
      ),
    ).toBe(204);
  });
  it('delegates only authenticated scope and uses cursor JSONAPI serialization', async () => {
    const result = await request(app.getHttpServer())
      .get(`/brands/${brandId}/font-assets?limit=20`)
      .expect(200);
    expect(fonts.list).toHaveBeenCalledWith(
      { organizationId: user.organizationId, actorId: user.userId, brandId },
      { limit: 20 },
    );
    expect(result.body.links.cursor).toEqual({
      limit: 20,
      hasMore: false,
      nextCursor: null,
    });
    expect(JSON.stringify(result.body)).not.toContain('private');
  });
  it('returns 201 then 200 replay and settles cancellation listener lifecycle', async () => {
    const buffer = Buffer.alloc(48);
    buffer.write('wOF2');
    const send = () =>
      request(app.getHttpServer())
        .post(`/brands/${brandId}/font-assets`)
        .field('requestId', '1254ff7f-367d-4cda-af62-1c666a73fc8f')
        .attach('file', buffer, {
          filename: 'Acme.woff2',
          contentType: 'font/woff2',
        });
    await send().expect(201);
    fonts.upload.mockResolvedValueOnce({ asset: row, created: false });
    await send().expect(200);
    expect(fonts.upload.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
    await request(app.getHttpServer())
      .delete(`/brands/${brandId}/font-assets/${row.id}`)
      .expect(204);
    expect(fonts.remove).toHaveBeenCalledWith(
      { organizationId: user.organizationId, actorId: user.userId, brandId },
      row.id,
    );
  });
  it('rejects extra authority, multiple files and invalid MIME before service dispatch', async () => {
    const buffer = Buffer.alloc(48);
    buffer.write('wOF2');
    await request(app.getHttpServer())
      .post(`/brands/${brandId}/font-assets`)
      .field('requestId', '1254ff7f-367d-4cda-af62-1c666a73fc8f')
      .field('category', 'FONT')
      .attach('file', buffer, {
        filename: 'Acme.woff2',
        contentType: 'font/woff2',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/brands/${brandId}/font-assets`)
      .field('requestId', '1254ff7f-367d-4cda-af62-1c666a73fc8f')
      .attach('file', buffer, {
        filename: 'Acme.woff2',
        contentType: 'image/png',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/brands/${brandId}/font-assets`)
      .field('requestId', '1254ff7f-367d-4cda-af62-1c666a73fc8f')
      .attach('file', buffer, {
        filename: 'Acme.woff2',
        contentType: 'font/woff2',
      })
      .attach('file', buffer, {
        filename: 'Two.woff2',
        contentType: 'font/woff2',
      })
      .expect(400);
    expect(fonts.upload).not.toHaveBeenCalled();
  });
  it('rejects absent organization or actor before any query', async () => {
    trusted = { ...user, organizationId: '' };
    await request(app.getHttpServer())
      .get(`/brands/${brandId}/font-assets`)
      .expect(403);
    trusted = { ...user, userId: '', id: '' };
    await request(app.getHttpServer())
      .get(`/brands/${brandId}/font-assets`)
      .expect(403);
    expect(fonts.list).not.toHaveBeenCalled();
  });
});
