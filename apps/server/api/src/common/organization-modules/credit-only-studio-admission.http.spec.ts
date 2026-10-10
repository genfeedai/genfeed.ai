import { StoryboardRunsController } from '@api/collections/content-runs/controllers/storyboard-runs.controller';
import { StoryboardCharacterReplaceService } from '@api/collections/content-runs/services/storyboard-character-replace.service';
import { StoryboardRunCapabilitiesService } from '@api/collections/content-runs/services/storyboard-run-capabilities.service';
import { StoryboardRunsService } from '@api/collections/content-runs/services/storyboard-runs.service';
import { ImagesUpscaleController } from '@api/collections/images/controllers/transformations/images-upscale.controller';
import { ImageUpscaleService } from '@api/collections/images/services/image-upscale.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { getOrganizationModuleExecutionContext } from '@api/common/organization-modules/organization-module-execution.context';
import { OrganizationModuleExecutionInterceptor } from '@api/common/organization-modules/organization-module-execution.interceptor';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type ExecutionContext,
  ForbiddenException,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => true,
}));

describe('credit-only Studio HTTP admission', () => {
  let app: INestApplication;
  let canFund: boolean;
  let approvePlan: ReturnType<typeof vi.fn>;
  let upscaleImage: ReturnType<typeof vi.fn>;
  let paidGrant: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    canFund = false;
    paidGrant = vi.fn().mockResolvedValue(true);
    approvePlan = vi.fn(async () => {
      expect(getOrganizationModuleExecutionContext()).toEqual({
        organizationId: 'org-1',
        moduleId: 'storyboard',
      });
      return { id: 'run-1' };
    });
    upscaleImage = vi.fn(async () => {
      expect(getOrganizationModuleExecutionContext()).toEqual({
        organizationId: 'org-1',
        moduleId: 'playground',
      });
      return { id: 'image-1' };
    });
    const admission = new OrganizationModuleAccessService(
      {
        organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
        organizationSetting: {
          findUnique: vi.fn().mockResolvedValue({
            moduleOverrides: {
              motion: false,
              batch: false,
              automation: false,
            },
          }),
        },
      } as never,
      { isSubscriptionGatedFresh: paidGrant } as never,
    );
    const fixtureAuth = {
      canActivate: (context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest<RequestWithContext>();
        req.user = {
          id: 'user-1',
          userId: 'user-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
        } as never;
        req.context = { organizationId: 'org-1', brandId: 'brand-1' } as never;
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [StoryboardRunsController, ImagesUpscaleController],
      providers: [
        { provide: StoryboardRunsService, useValue: { approvePlan } },
        { provide: StoryboardRunCapabilitiesService, useValue: {} },
        { provide: StoryboardCharacterReplaceService, useValue: {} },
        { provide: ImageUpscaleService, useValue: { upscaleImage } },
        {
          provide: LoggerService,
          useValue: { log: vi.fn(), debug: vi.fn(), error: vi.fn() },
        },
        { provide: OrganizationModuleAccessService, useValue: admission },
        { provide: APP_GUARD, useValue: fixtureAuth },
        { provide: APP_GUARD, useClass: OrganizationModuleGuard },
        {
          provide: APP_INTERCEPTOR,
          useClass: OrganizationModuleExecutionInterceptor,
        },
      ],
    })
      .overrideGuard(CreditsGuard)
      .useValue({
        canActivate: () => {
          if (!canFund) throw new ForbiddenException('Insufficient credits');
          return true;
        },
      })
      .overrideGuard(ModelsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
  });

  it('admits Storyboard approval without a paid subscription or enabled Automation/Motion', async () => {
    const result = await request(app.getHttpServer())
      .post('/brands/brand-1/storyboard-runs/run-1/plan/approve')
      .send({
        expectedRevision: 1,
        organizationId: 'other-org',
        moduleId: 'automation',
      });
    expect(result.status).toBe(201);
    expect(approvePlan).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'run-1',
      expect.objectContaining({ expectedRevision: 1 }),
    );
    expect(paidGrant).not.toHaveBeenCalled();
    expect(getOrganizationModuleExecutionContext()).toBeUndefined();
  });

  it('still blocks unfunded Playground work before a generation service is called', async () => {
    const result = await request(app.getHttpServer())
      .post('/images/image-1/upscale')
      .send({});
    expect(result.status).toBe(403);
    expect(upscaleImage).not.toHaveBeenCalled();
    expect(paidGrant).not.toHaveBeenCalled();
  });

  it('admits funded Playground work without a subscription and retains authenticated module purpose', async () => {
    canFund = true;
    const result = await request(app.getHttpServer())
      .post('/images/image-1/upscale')
      .send({ moduleId: 'automation', organizationId: 'other-org' });
    expect(result.status).toBe(201);
    expect(upscaleImage).toHaveBeenCalledOnce();
    expect(paidGrant).not.toHaveBeenCalled();
    expect(getOrganizationModuleExecutionContext()).toBeUndefined();
  });
});
