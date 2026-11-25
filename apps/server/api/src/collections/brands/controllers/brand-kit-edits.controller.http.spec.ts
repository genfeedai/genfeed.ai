import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandKitEditsController } from '@api/collections/brands/controllers/brand-kit-edits.controller';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { MemberRole } from '@genfeedai/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

const GENERATION_RULES = { schemaVersion: 1 };

function revision(content: Record<string, unknown> = {}) {
  return {
    brandId: 'brand-1',
    content: { fields: { label: { currentValue: 'Acme' } }, ...content },
    id: 'rev-1',
    status: 'DRAFT',
    updatedAt: '2026-11-25T10:00:00.000Z',
    version: 1,
  };
}

describe('Brand Kit section edits', () => {
  const path = '/brands/brand-1/brand-kit';
  let app: INestApplication;
  let membershipRole: MemberRole = MemberRole.USER;
  let revisions: Array<ReturnType<typeof revision>> = [];
  const applied: unknown[] = [];
  const approved: unknown[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BrandKitEditsController],
      providers: [
        {
          provide: BrandsService,
          useValue: {
            brandAccessService: {
              assertBrandKitEdit: async () => ({
                hasBrandKitGrant: true,
                membershipRole,
              }),
            },
            invalidateBrandContextCaches: async () => undefined,
            updateAgentConfig: async (
              id: string,
              _orgId: string,
              agentConfig: unknown,
            ) => ({ id, agentConfig }),
          },
        },
        {
          provide: BrandOsRevisionsService,
          useValue: {
            applyIdentity: async (
              _org: string,
              _brand: string,
              dto: unknown,
            ) => {
              applied.push(dto);
              return revision();
            },
            approve: async (
              _org: string,
              _brand: string,
              id: string,
              userId: string,
              updatedAt: string,
            ) => {
              approved.push({ id, updatedAt, userId });
              return { ...revision(), status: 'APPROVED' };
            },
            get: async (_org: string, _brand: string, id: string) =>
              revisions.find((entry) => entry.id === id),
            list: async () => revisions,
          },
        },
        { provide: RolesGuard, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const user: AuthenticatedUser = {
        brandId: 'brand-1',
        id: 'user-1',
        organizationId: 'org-1',
        userId: 'user-1',
      };
      req.user = user;
      next();
    });
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('writes only the supplied writing-voice fields', async () => {
    const result = await request(app.getHttpServer())
      .patch(`${path}/writing-voice`)
      .send({ tone: 'Calm and precise' })
      .expect(200);
    expect(result.body.data.attributes.agentConfig).toEqual({
      voice: { tone: 'Calm and precise' },
    });
  });

  it('rejects an unrelated write even with a valid section field', async () => {
    await request(app.getHttpServer())
      .patch(`${path}/strategy`)
      .send({ frequency: 'weekly', logo: 'other-asset' })
      .expect(400);
  });

  it('refuses an assigned ordinary member with the grant for visual edits', async () => {
    await request(app.getHttpServer())
      .patch(`${path}/visual-identity`)
      .send({ primaryColor: '#AABBCC' })
      .expect(403);
  });

  describe('brand name and approval', () => {
    beforeEach(() => {
      membershipRole = MemberRole.ADMIN;
      revisions = [revision()];
      applied.length = 0;
      approved.length = 0;
    });

    it('refuses an assigned ordinary member the brand name and the approval', async () => {
      membershipRole = MemberRole.USER;

      await request(app.getHttpServer())
        .patch(`${path}/identity`)
        .send({ label: 'Acme' })
        .expect(403);
      await request(app.getHttpServer()).get(`${path}/approval`).expect(403);
      await request(app.getHttpServer())
        .post(`${path}/approve`)
        .send({ revisionId: 'rev-1', updatedAt: '2026-11-25T10:00:00.000Z' })
        .expect(403);
      expect(applied).toEqual([]);
      expect(approved).toEqual([]);
    });

    it('lets an admin set the brand name and description', async () => {
      await request(app.getHttpServer())
        .patch(`${path}/identity`)
        .send({ description: 'Pasta, daily', label: 'Acme' })
        .expect(200);

      expect(applied).toEqual([{ description: 'Pasta, daily', label: 'Acme' }]);
    });

    it('rejects an identity write that carries another field', async () => {
      await request(app.getHttpServer())
        .patch(`${path}/identity`)
        .send({ label: 'Acme', primaryColor: '#AABBCC' })
        .expect(400);
      expect(applied).toEqual([]);
    });

    it('shows the draft waiting for approval, and says when there is none', async () => {
      const shown = await request(app.getHttpServer())
        .get(`${path}/approval`)
        .expect(200);
      expect(shown.body.data.id).toBe('rev-1');
      expect(shown.body.data.attributes.updatedAt).toBe(
        '2026-11-25T10:00:00.000Z',
      );

      revisions = [{ ...revision(), status: 'APPROVED' }];
      await request(app.getHttpServer()).get(`${path}/approval`).expect(400);
    });

    it('approves the draft the owner reviewed under the connection user', async () => {
      await request(app.getHttpServer())
        .post(`${path}/approve`)
        .send({ revisionId: 'rev-1', updatedAt: '2026-11-25T10:00:00.000Z' })
        .expect(200);

      expect(approved).toEqual([
        {
          id: 'rev-1',
          updatedAt: '2026-11-25T10:00:00.000Z',
          userId: 'user-1',
        },
      ]);
    });

    it('refuses to approve a draft that has no brand name', async () => {
      revisions = [
        {
          ...revision(),
          content: { fields: { label: { currentValue: '  ' } } },
        },
      ];

      await request(app.getHttpServer())
        .post(`${path}/approve`)
        .send({ revisionId: 'rev-1', updatedAt: '2026-11-25T10:00:00.000Z' })
        .expect(400);
      expect(approved).toEqual([]);
    });

    it('leaves a draft with generation rules to the web app review', async () => {
      revisions = [revision({ generationRules: GENERATION_RULES })];

      const refused = await request(app.getHttpServer())
        .post(`${path}/approve`)
        .send({ revisionId: 'rev-1', updatedAt: '2026-11-25T10:00:00.000Z' })
        .expect(409);

      expect(JSON.stringify(refused.body)).toContain('web app');
      expect(approved).toEqual([]);
    });
  });
});
