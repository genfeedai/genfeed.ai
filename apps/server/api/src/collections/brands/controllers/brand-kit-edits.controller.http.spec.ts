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

describe('Brand Kit section edits', () => {
  const path = '/brands/brand-1/brand-kit';
  let app: INestApplication;

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
                membershipRole: MemberRole.USER,
              }),
            },
            updateAgentConfig: async (
              id: string,
              _orgId: string,
              agentConfig: unknown,
            ) => ({ id, agentConfig }),
          },
        },
        { provide: BrandOsRevisionsService, useValue: {} },
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
});
