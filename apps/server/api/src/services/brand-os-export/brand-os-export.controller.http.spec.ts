import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import {
  BrandOsExportController,
  PublicBrandOsExportController,
} from '@api/services/brand-os-export/brand-os-export.controller';
import { BrandOsExportService } from '@api/services/brand-os-export/brand-os-export.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const actor: AuthenticatedUser = {
  brandId: 'brand-1',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
};
const revision = {
  approvedAt: new Date('2026-09-14T00:00:00Z'),
  brandId: 'brand-1',
  content: { fields: { label: { currentValue: 'Portable Brand' } } },
  exportSchemaVersion: '1',
  id: 'revision-1',
  status: 'APPROVED',
};

describe('Brand OS export real HTTP pipeline', () => {
  let app: INestApplication;
  let published = false;
  let revoked = false;
  let memberRole: MemberRole;
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'brand-1' }]),
    $transaction: vi.fn(),
    activity: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
    member: {
      findFirst: vi.fn().mockImplementation(() => ({ roleKey: memberRole })),
    },
    brandOsRevision: { findFirst: vi.fn().mockResolvedValue(revision) },
    brandOsPublication: {
      findFirst: vi
        .fn()
        .mockImplementation((args: { where?: { revokedAt?: null } }) =>
          published && (args.where?.revokedAt !== null || !revoked)
            ? {
                brand: { organizationId: 'org-1' },
                brandId: 'brand-1',
                id: 'publication-1',
                organizationId: 'org-1',
                publishedAt: new Date('2026-09-14T00:00:00Z'),
                publishedRevisionIds: ['revision-1'],
                revisionId: 'revision-1',
                revokedAt: revoked ? new Date() : null,
              }
            : null,
        ),
      upsert: vi.fn().mockImplementation(() => {
        published = true;
        revoked = false;
        return {};
      }),
      updateMany: vi.fn().mockImplementation(() => {
        revoked = true;
        return { count: 1 };
      }),
    },
  };
  beforeAll(async () => {
    db.$transaction.mockImplementation(
      (work: (tx: typeof db) => Promise<void>) => work(db),
    );
    const service = new BrandOsExportService(
      db as unknown as PrismaService,
      { get: () => 'https://api.example.com/v1' } as unknown as ConfigService,
      { log: vi.fn() } as unknown as LoggerService,
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [BrandOsExportController, PublicBrandOsExportController],
      providers: [{ provide: BrandOsExportService, useValue: service }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(
      (
        req: Request & { user?: AuthenticatedUser },
        _res: Response,
        next: NextFunction,
      ) => {
        if (req.headers.authorization === 'Bearer member-session')
          req.user = actor;
        next();
      },
    );
    app.useGlobalGuards({
      canActivate(context: ExecutionContext) {
        const req = context
          .switchToHttp()
          .getRequest<Request & { user?: AuthenticatedUser }>();
        if (!req.path.startsWith('/public/') && !req.user)
          throw new UnauthorizedException();
        return true;
      },
    });
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });
  beforeEach(() => {
    published = false;
    revoked = false;
    memberRole = MemberRole.OWNER;
  });
  afterAll(async () => {
    await app.close();
  });
  it('returns anonymous private requests as a generic uncached 404', async () => {
    const result = await request(app.getHttpServer())
      .get('/brands/brand-1/brand-os/design.md')
      .expect(404);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(result.body)).not.toContain('brand-1');
  });
  it('serves member Markdown with exact digest, revision, and download headers', async () => {
    const result = await request(app.getHttpServer())
      .get('/brands/brand-1/brand-os/design.md')
      .set('Authorization', 'Bearer member-session')
      .expect(200);
    expect(result.headers['content-type']).toContain('text/markdown');
    expect(result.headers['content-disposition']).toBe(
      'attachment; filename="design.md"',
    );
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['content-digest']).toMatch(
      /^sha-256=:[A-Za-z0-9+/]+=*:$/,
    );
    expect(result.headers['x-brand-os-revision']).toBe('revision-1');
    expect(result.text).toContain('Portable Brand');
  });
  it('serializes export state through the canonical JSON API serializer', async () => {
    const result = await request(app.getHttpServer())
      .get('/brands/brand-1/brand-os/export')
      .set('Authorization', 'Bearer member-session')
      .expect(200);
    expect(result.body.data).toMatchObject({
      id: 'brand-1',
      type: 'brand-os-export',
      attributes: {
        canPublish: true,
        state: 'private',
        revisionId: 'revision-1',
      },
    });
    expect(result.body.data.attributes).not.toHaveProperty('content');
    expect(result.body.data.attributes).not.toHaveProperty('organizationId');
  });
  it('validates publication input before the service and requires administrator membership', async () => {
    await request(app.getHttpServer())
      .post('/brands/brand-1/brand-os/publication')
      .set('Authorization', 'Bearer member-session')
      .send({ revisionId: '../bad' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/brands/brand-1/brand-os/publication')
      .set('Authorization', 'Bearer member-session')
      .send({})
      .expect(400);
    memberRole = MemberRole.USER;
    await request(app.getHttpServer())
      .post('/brands/brand-1/brand-os/publication')
      .set('Authorization', 'Bearer member-session')
      .send({ revisionId: 'revision-1' })
      .expect(404);
  });
  it('publishes publicly and revokes stable and immutable URLs through HTTP', async () => {
    const stable = '/public/brand-os/publication-1/design.md';
    const immutable = '/public/brand-os/publication-1/revision-1/design.md';
    await request(app.getHttpServer()).get(stable).expect(404);
    await request(app.getHttpServer())
      .post('/brands/brand-1/brand-os/publication')
      .set('Authorization', 'Bearer member-session')
      .send({ revisionId: 'revision-1' })
      .expect(201);
    const first = await request(app.getHttpServer()).get(stable).expect(200);
    const second = await request(app.getHttpServer())
      .get(immutable)
      .expect(200);
    expect(first.text).toBe(second.text);
    expect(first.headers['content-disposition']).toBe(
      'inline; filename="design.md"',
    );
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.headers['x-robots-tag']).toContain('noindex');
    await request(app.getHttpServer())
      .delete('/brands/brand-1/brand-os/publication')
      .set('Authorization', 'Bearer member-session')
      .expect(200);
    const missing = await request(app.getHttpServer()).get(stable).expect(404);
    expect(missing.headers['cache-control']).toBe('no-store');
    await request(app.getHttpServer()).get(immutable).expect(404);
  });
});
