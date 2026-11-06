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

/** Admin → Flags with nothing released: only Playground and Storyboard admit work. */
interface ProjectWork {
  body?: unknown;
  id: string;
  operation: 'cancel' | 'export' | 'retry';
  organizationId: string;
  userId: string;
}

const UNRELEASED_PLATFORM = {
  getFeatureSettingsState: async () => ({
    isResolved: true,
    settings: { flags: {} },
  }),
};

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => true,
}));

describe('Motion existing-work cancellation admission', () => {
  let app: INestApplication;
  let work: ProjectWork[];
  let reads: { paidGrant: number; settings: number };
  let isSettingsDown: boolean;

  beforeEach(async () => {
    work = [];
    reads = { paidGrant: 0, settings: 0 };
    isSettingsDown = false;

    const record =
      (operation: ProjectWork['operation']) =>
      async (
        user: { organizationId: string; userId: string },
        id: string,
        body?: unknown,
      ) => {
        if (id !== 'project-1') {
          throw new ForbiddenException('Project access denied');
        }
        work.push({
          body,
          id,
          operation,
          organizationId: user.organizationId,
          userId: user.userId,
        });
        return { id };
      };

    const admission = new OrganizationModuleAccessService(
      {
        organization: { findFirst: async () => ({ id: 'org-1' }) },
        organizationSetting: {
          findUnique: async () => {
            reads.settings += 1;
            if (isSettingsDown) {
              throw new Error('settings unavailable');
            }
            return { moduleOverrides: { motion: false } };
          },
        },
      } as unknown as ConstructorParameters<
        typeof OrganizationModuleAccessService
      >[0],
      {
        isSubscriptionGatedFresh: async () => {
          reads.paidGrant += 1;
          return true;
        },
      } as unknown as ConstructorParameters<
        typeof OrganizationModuleAccessService
      >[1],
      UNRELEASED_PLATFORM as unknown as ConstructorParameters<
        typeof OrganizationModuleAccessService
      >[2],
    );
    const fixtureAuth = {
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest<RequestWithContext>();
        req.user = {
          brandId: 'brand-1',
          id: 'user-1',
          organizationId: 'org-1',
          userId: 'user-1',
        } as unknown as RequestWithContext['user'];
        req.context = {
          brandId: 'brand-1',
          organizationId: req.headers['x-test-conflicting-context']
            ? 'org-2'
            : 'org-1',
        } as unknown as RequestWithContext['context'];
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [VisualProjectsController],
      providers: [
        {
          provide: VisualProjectsService,
          useValue: {
            cancel: record('cancel'),
            export: record('export'),
            retry: record('retry'),
          },
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

    expect(work).toEqual([
      {
        body: { revision: 1 },
        id: 'project-1',
        operation: 'cancel',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ]);
    expect(reads).toEqual({ paidGrant: 0, settings: 0 });
  });

  it('keeps cancellation usable when module settings cannot be read', async () => {
    isSettingsDown = true;

    await request(app.getHttpServer())
      .post('/visual-projects/project-1/cancel')
      .send({ revision: 1 })
      .expect(201);

    expect(work.map((entry) => entry.operation)).toEqual(['cancel']);
    expect(reads.settings).toBe(0);
  });

  it.each(['retry', 'exports'])(
    'still blocks new %s work and ignores caller-supplied cancel policy',
    async (operation) => {
      await request(app.getHttpServer())
        .post(`/visual-projects/project-1/${operation}`)
        .send({ moduleId: 'playground', operation: 'cancel' })
        .expect(403);

      expect(work).toEqual([]);
    },
  );

  it('requires matching authenticated context before cancellation', async () => {
    await request(app.getHttpServer())
      .post('/visual-projects/project-1/cancel')
      .set('x-test-conflicting-context', '1')
      .send({ revision: 1 })
      .expect(403);

    expect(work).toEqual([]);
  });

  it('does not bypass the existing project authorization check', async () => {
    await request(app.getHttpServer())
      .post('/visual-projects/foreign-project/cancel')
      .send({ revision: 1 })
      .expect(403);

    expect(work).toEqual([]);
  });
});
