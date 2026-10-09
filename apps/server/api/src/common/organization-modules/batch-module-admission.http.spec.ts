import { BatchProjectsController } from '@api/collections/batch-projects/controllers/batch-projects.controller';
import { BatchProjectSchedulingService } from '@api/collections/batch-projects/services/batch-project-scheduling.service';
import { BatchProjectsService } from '@api/collections/batch-projects/services/batch-projects.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
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

describe('Batch HTTP organization module admission', () => {
  let app: INestApplication;
  let isEnabled: boolean;
  let actorFlags: { isApiKey?: boolean; isSuperAdmin?: boolean };
  let create: ReturnType<typeof vi.fn>;
  let findOne: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    isEnabled = false;
    actorFlags = {};
    create = vi.fn().mockResolvedValue({ id: 'project-1' });
    findOne = vi.fn().mockResolvedValue({ id: 'project-1' });
    const admission = new OrganizationModuleAccessService(
      {
        organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
        organizationSetting: {
          findUnique: vi.fn(async () => ({
            moduleOverrides: { batch: isEnabled },
          })),
        },
      } as never,
      { isSubscriptionGatedFresh: vi.fn().mockResolvedValue(true) } as never,
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
      controllers: [BatchProjectsController],
      providers: [
        { provide: BatchProjectsService, useValue: { create, findOne } },
        { provide: BatchProjectSchedulingService, useValue: {} },
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
    'blocks disabled Batch before the actual controller creates a project: %j',
    async (flags) => {
      actorFlags = flags;
      const result = await request(app.getHttpServer())
        .post('/batch-projects')
        .send({
          name: 'draft',
          moduleId: 'playground',
          moduleOverrides: { batch: true },
          organizationId: 'other-org',
        });
      expect(result.status).toBe(403);
      expect(result.body.code).toBe('ORGANIZATION_MODULE_DISABLED');
      expect(create).not.toHaveBeenCalled();
    },
  );
  it('allows explicitly enabled Batch without an active subscription', async () => {
    isEnabled = true;
    const result = await request(app.getHttpServer())
      .post('/batch-projects')
      .send({ name: 'draft' });
    expect(result.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      { name: 'draft' },
      expect.objectContaining({ organizationId: 'org-1' }),
    );
  });
  it('preserves existing project reads when Batch is disabled', async () => {
    const result = await request(app.getHttpServer()).get(
      '/batch-projects/project-1',
    );
    expect(result.status).toBe(200);
    expect(findOne).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ organizationId: 'org-1' }),
    );
  });
});
