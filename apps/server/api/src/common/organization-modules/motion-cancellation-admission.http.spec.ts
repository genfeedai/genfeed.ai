import { VisualProjectsController } from '@api/collections/visual-projects/controllers/visual-projects.controller';
import { VisualProjectsService } from '@api/collections/visual-projects/services/visual-projects.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  type ExecutionContext,
  ForbiddenException,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => true,
}));

describe('Motion existing-work cancellation admission', () => {
  let app: INestApplication;
  let cancel: ReturnType<typeof vi.fn>;
  let retry: ReturnType<typeof vi.fn>;
  let renderExport: ReturnType<typeof vi.fn>;
  let findSettings: ReturnType<typeof vi.fn>;
  let paidGrant: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    cancel = vi.fn(async (user, id) => {
      expect(user.organizationId).toBe('org-1');
      expect(user.userId).toBe('user-1');
      if (id !== 'project-1')
        throw new ForbiddenException('Project access denied');
      return { id: 'project-1' };
    });
    retry = vi.fn();
    renderExport = vi.fn();
    findSettings = vi
      .fn()
      .mockResolvedValue({ moduleOverrides: { motion: false } });
    paidGrant = vi.fn().mockResolvedValue(true);
    const admission = new OrganizationModuleAccessService(
      {
        organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
        organizationSetting: { findUnique: findSettings },
      } as never,
      { isSubscriptionGatedFresh: paidGrant } as never,
    );
    const fixtureAuth = {
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest<RequestWithContext>();
        req.user = {
          id: 'user-1',
          userId: 'user-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
        } as never;
        req.context = {
          organizationId: req.headers['x-test-conflicting-context']
            ? 'org-2'
            : 'org-1',
          brandId: 'brand-1',
        } as never;
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [VisualProjectsController],
      providers: [
        {
          provide: VisualProjectsService,
          useValue: { cancel, retry, export: renderExport },
        },
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

  it('reaches existing cancellation while Motion is off without a settings or subscription read', async () => {
    await request(app.getHttpServer())
      .post('/visual-projects/project-1/cancel')
      .send({ revision: 1 })
      .expect(201);
    expect(cancel).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
      'project-1',
      { revision: 1 },
    );
    expect(findSettings).not.toHaveBeenCalled();
    expect(paidGrant).not.toHaveBeenCalled();
  });
  it('keeps cancellation usable when module settings cannot be read', async () => {
    findSettings.mockRejectedValue(new Error('settings unavailable'));
    await request(app.getHttpServer())
      .post('/visual-projects/project-1/cancel')
      .send({ revision: 1 })
      .expect(201);
    expect(findSettings).not.toHaveBeenCalled();
  });
  it.each(['retry', 'exports'])(
    'still blocks new %s work and ignores caller-supplied cancel policy',
    async (operation) => {
      await request(app.getHttpServer())
        .post(`/visual-projects/project-1/${operation}`)
        .send({ operation: 'cancel', moduleId: 'playground' })
        .expect(403);
      expect(retry).not.toHaveBeenCalled();
      expect(renderExport).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
    },
  );
  it('requires matching authenticated context before cancellation', async () => {
    await request(app.getHttpServer())
      .post('/visual-projects/project-1/cancel')
      .set('x-test-conflicting-context', '1')
      .send({ revision: 1 })
      .expect(403);
    expect(cancel).not.toHaveBeenCalled();
  });
  it('does not bypass the existing project authorization check', async () => {
    await request(app.getHttpServer())
      .post('/visual-projects/foreign-project/cancel')
      .send({ revision: 1 })
      .expect(403);
    expect(retry).not.toHaveBeenCalled();
    expect(renderExport).not.toHaveBeenCalled();
  });
});
