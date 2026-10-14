import { TurboProjectsController } from '@api/collections/turbo-projects/controllers/turbo-projects.controller';
import { TurboProjectSchedulingService } from '@api/collections/turbo-projects/services/turbo-project-scheduling.service';
import { TurboProjectsService } from '@api/collections/turbo-projects/services/turbo-projects.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TurboContentController } from '@api/services/turbo-content/turbo-content.controller';
import { TurboContentService } from '@api/services/turbo-content/turbo-content.service';
import { ApiKeyScope } from '@genfeedai/contracts';
import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => true,
}));

describe('Turbo HTTP organization module admission', () => {
  let app: INestApplication;
  let isReleased: boolean;
  let actorFlags: { isApiKey?: boolean; isSuperAdmin?: boolean };
  let create: ReturnType<typeof vi.fn>;
  let findOne: ReturnType<typeof vi.fn>;
  let queueTurboRun: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    isReleased = false;
    actorFlags = {};
    create = vi.fn().mockResolvedValue({ id: 'project-1' });
    findOne = vi.fn().mockResolvedValue({ id: 'project-1' });
    queueTurboRun = vi
      .fn()
      .mockResolvedValue({ jobId: 'job-1', status: 'queued' });
    const admission = new OrganizationModuleAccessService(
      {
        organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
        organizationSetting: {
          findUnique: vi.fn(async () => ({
            isReleasePreviewEnabled: false,
            // Hidden by the organization: never refuses API or MCP work.
            moduleOverrides: { turbo: false },
          })),
        },
      } as never,
      { isSubscriptionGatedFresh: vi.fn().mockResolvedValue(true) } as never,
      {
        getFeatureSettingsState: vi.fn(async () => ({
          isResolved: true,
          settings: { flags: { release_turbo: isReleased } },
        })),
      } as never,
    );
    const fixtureAuth = {
      canActivate: (context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest<RequestWithContext>();
        req.user = {
          id: 'user-1',
          userId: 'user-1',
          organizationId: 'org-1',
          scopes: [ApiKeyScope.POSTS_DRAFT],
          ...actorFlags,
        } as never;
        req.context = {
          organizationId: 'org-1',
          isSuperAdmin: actorFlags.isSuperAdmin === true,
        } as never;
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [TurboProjectsController, TurboContentController],
      providers: [
        { provide: TurboProjectsService, useValue: { create, findOne } },
        { provide: TurboProjectSchedulingService, useValue: {} },
        { provide: TurboContentService, useValue: { queueTurboRun } },
        { provide: OrganizationModuleAccessService, useValue: admission },
        { provide: APP_GUARD, useValue: fixtureAuth },
        { provide: APP_GUARD, useClass: OrganizationModuleGuard },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
  });

  it.each([{}, { isApiKey: true }, { isSuperAdmin: true }])(
    'blocks unreleased Turbo before the actual controller creates a project: %j',
    async (flags) => {
      actorFlags = flags;
      const result = await request(app.getHttpServer())
        .post('/turbo-projects')
        .send({
          name: 'draft',
          moduleId: 'playground',
          moduleOverrides: { turboRun: true },
          organizationId: 'other-org',
        });
      expect(result.status).toBe(403);
      expect(result.body.code).toBe('ORGANIZATION_MODULE_UNRELEASED');
      expect(create).not.toHaveBeenCalled();
    },
  );
  it('allows released Turbo the organization hides, without a subscription', async () => {
    isReleased = true;
    const result = await request(app.getHttpServer())
      .post('/turbo-projects')
      .send({ name: 'draft' });
    expect(result.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      { name: 'draft' },
      expect.objectContaining({ organizationId: 'org-1' }),
    );
  });
  it('preserves existing project reads while Turbo is unreleased', async () => {
    const result = await request(app.getHttpServer()).get(
      '/turbo-projects/project-1',
    );
    expect(result.status).toBe(200);
    expect(findOne).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ organizationId: 'org-1' }),
    );
  });

  it.each([{}, { isApiKey: true }, { isSuperAdmin: true }])(
    'blocks the direct Turbo content HTTP endpoint before queueing: %j',
    async (flags) => {
      actorFlags = flags;
      const result = await request(app.getHttpServer())
        .post('/brands/brand-1/content/turbo')
        .send({
          skillSlug: 'content-writing',
          count: 2,
          moduleId: 'playground',
          organizationId: 'other-org',
        });
      expect(result.status).toBe(403);
      expect(result.body.code).toBe('ORGANIZATION_MODULE_UNRELEASED');
      expect(queueTurboRun).not.toHaveBeenCalled();
    },
  );

  it('rechecks a previously released Turbo content route before the next request', async () => {
    isReleased = true;
    const url = '/brands/brand-1/content/turbo';
    expect(
      (
        await request(app.getHttpServer())
          .post(url)
          .send({ skillSlug: 'content-writing', count: 2 })
      ).status,
    ).toBe(201);
    expect(queueTurboRun).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        count: 2,
        organizationId: 'org-1',
        params: undefined,
        skillSlug: 'content-writing',
      },
      'user-1',
    );
    isReleased = false;
    const result = await request(app.getHttpServer())
      .post(url)
      .send({ skillSlug: 'content-writing', count: 2 });
    expect(result.status).toBe(403);
    expect(queueTurboRun).toHaveBeenCalledTimes(1);
  });
});
