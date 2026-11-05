import { StoryboardRunsController } from '@api/collections/content-runs/controllers/storyboard-runs.controller';
import { StoryboardARollService } from '@api/collections/content-runs/services/storyboard-a-roll.service';
import { StoryboardCharacterReplaceService } from '@api/collections/content-runs/services/storyboard-character-replace.service';
import { StoryboardLongFormAssemblyService } from '@api/collections/content-runs/services/storyboard-long-form-assembly.service';
import { StoryboardLongFormEstimateService } from '@api/collections/content-runs/services/storyboard-long-form-estimate.service';
import { StoryboardLongFormTranslationService } from '@api/collections/content-runs/services/storyboard-long-form-translation.service';
import { StoryboardRunCapabilitiesService } from '@api/collections/content-runs/services/storyboard-run-capabilities.service';
import { StoryboardRunsService } from '@api/collections/content-runs/services/storyboard-runs.service';
import { StoryboardSlideshowPostService } from '@api/collections/content-runs/services/storyboard-slideshow-post.service';
import { StoryboardStillsService } from '@api/collections/content-runs/services/storyboard-stills.service';
import { ImagesUpscaleController } from '@api/collections/images/controllers/transformations/images-upscale.controller';
import { ImageUpscaleService } from '@api/collections/images/services/image-upscale.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { LoggerService } from '@libs/logger/logger.service';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => true,
}));

/** Admin → Flags kill switches (#8796): Storyboard and Studio both off. */
const SWITCHED_OFF_FLAGS = { storyboard: false, studio: false };

describe('platform kill switch HTTP admission', () => {
  let app: INestApplication;
  let isSuperAdmin: boolean;
  let approvePlan: ReturnType<typeof vi.fn>;
  let list: ReturnType<typeof vi.fn>;
  let upscaleImage: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    isSuperAdmin = false;
    approvePlan = vi.fn().mockResolvedValue({ id: 'run-1' });
    list = vi.fn().mockResolvedValue([]);
    upscaleImage = vi.fn().mockResolvedValue({ id: 'image-1' });
    const admission = new OrganizationModuleAccessService(
      {
        organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
        organizationSetting: {
          findUnique: vi.fn().mockResolvedValue({
            isReleasePreviewEnabled: false,
          }),
        },
      } as never,
      { isSubscriptionGatedFresh: vi.fn().mockResolvedValue(false) } as never,
      {
        getFeatureSettingsState: async () => ({
          isResolved: true,
          settings: { flags: SWITCHED_OFF_FLAGS },
        }),
      } as never,
    );
    const fixtureAuth = {
      canActivate: (context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest<RequestWithContext>();
        req.user = {
          id: 'user-1',
          userId: 'user-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
          isSuperAdmin,
        } as never;
        req.context = {
          organizationId: 'org-1',
          brandId: 'brand-1',
          isSuperAdmin,
        } as never;
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [StoryboardRunsController, ImagesUpscaleController],
      providers: [
        { provide: StoryboardRunsService, useValue: { approvePlan, list } },
        { provide: StoryboardRunCapabilitiesService, useValue: {} },
        { provide: StoryboardCharacterReplaceService, useValue: {} },
        { provide: StoryboardStillsService, useValue: {} },
        { provide: StoryboardSlideshowPostService, useValue: {} },
        { provide: StoryboardARollService, useValue: {} },
        { provide: StoryboardLongFormAssemblyService, useValue: {} },
        { provide: StoryboardLongFormEstimateService, useValue: {} },
        { provide: StoryboardLongFormTranslationService, useValue: {} },
        { provide: ImageUpscaleService, useValue: { upscaleImage } },
        {
          provide: LoggerService,
          useValue: { log: vi.fn(), debug: vi.fn(), error: vi.fn() },
        },
        { provide: OrganizationModuleAccessService, useValue: admission },
        { provide: APP_GUARD, useValue: fixtureAuth },
        { provide: APP_GUARD, useClass: OrganizationModuleGuard },
      ],
    })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
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

  it('answers a Storyboard write with 404 while Storyboard is switched off', async () => {
    const result = await request(app.getHttpServer())
      .post('/brands/brand-1/storyboard-runs/run-1/plan/approve')
      .send({ expectedRevision: 1 });
    expect(result.status).toBe(404);
    expect(approvePlan).not.toHaveBeenCalled();
  });

  it('answers a Storyboard read with 404 while Storyboard is switched off', async () => {
    const result = await request(app.getHttpServer()).get(
      '/brands/brand-1/storyboard-runs',
    );
    expect(result.status).toBe(404);
    expect(list).not.toHaveBeenCalled();
  });

  it('lets a superadmin inspect switched-off Storyboard', async () => {
    isSuperAdmin = true;
    const result = await request(app.getHttpServer())
      .post('/brands/brand-1/storyboard-runs/run-1/plan/approve')
      .send({ expectedRevision: 1 });
    expect(result.status).toBe(201);
    expect(approvePlan).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'run-1',
      expect.objectContaining({ expectedRevision: 1 }),
    );
  });

  it('keeps Playground generation working with Studio switched off', async () => {
    const result = await request(app.getHttpServer())
      .post('/images/image-1/upscale')
      .send({});
    expect(result.status).toBe(201);
    expect(upscaleImage).toHaveBeenCalledOnce();
  });
});
