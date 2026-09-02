import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsAgentConfigController } from '@api/collections/brands/controllers/brands-agent-config.controller';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { BrandSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

/**
 * HTTP-level contract tests for `PATCH /brands/:id/agent-config`.
 *
 * The sibling `brands-agent-config.controller.spec.ts` instantiates the
 * controller directly, so it never exercises the pipe that turns the request
 * body into a DTO. That blind spot let a required-but-omitted DTO field ship:
 * every partial autosave from the app 400'd before reaching the controller and
 * the unit suite stayed green. These tests go through a real Nest HTTP
 * pipeline with the real `ValidationPipe`, so the DTO contract is asserted
 * against the payloads the app actually sends.
 */
describe('PATCH /brands/:id/agent-config (HTTP pipeline)', () => {
  const orgId = testId('org');
  const brandId = testId('brand');

  const mockBrand = {
    id: brandId,
    isDeleted: false,
    label: 'Test Brand',
    slug: 'test-brand',
  };

  let app: INestApplication;
  let assertAccessibleSkillSlugs: ReturnType<typeof vi.fn>;
  let updateAgentConfig: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    assertAccessibleSkillSlugs = vi.fn().mockResolvedValue(undefined);
    updateAgentConfig = vi.fn().mockResolvedValue(mockBrand);

    vi.spyOn(BrandSerializer, 'serialize').mockImplementation((data) => ({
      data,
    }));

    const moduleRef = await Test.createTestingModule({
      controllers: [BrandsAgentConfigController],
      providers: [
        { provide: BrandsService, useValue: { updateAgentConfig } },
        {
          provide: IngredientsService,
          useValue: {
            findAvatarImageById: vi.fn().mockResolvedValue({ id: 'avatar-1' }),
          },
        },
        {
          provide: OrganizationSettingsService,
          useValue: { findOne: vi.fn().mockResolvedValue(null) },
        },
        {
          provide: SkillsService,
          useValue: { assertAccessibleSkillSlugs },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    app = moduleRef.createNestApplication();

    // `@CurrentUser()` reads `request.user`; the auth guard that normally
    // populates it is out of scope for a validation contract test.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user: User }).user = {
        id: 'user-1',
        organizationId: orgId,
        userId: orgId,
      } as unknown as User;
      next();
    });

    app.useGlobalPipes(new ValidationPipe());

    await app.init();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app?.close();
  });

  beforeEach(() => {
    assertAccessibleSkillSlugs.mockClear();
    updateAgentConfig.mockClear();
    updateAgentConfig.mockResolvedValue(mockBrand);
  });

  /**
   * Mirrors `buildAgentConfigPayload()` in
   * `packages/pages/brands/components/sidebar/useBrandDetailAgentProfileCard.ts`
   * — the inline field-level autosave on the brand agent profile card. It never
   * sends `enabledSkills`, and `buildVoice()` never sends `taglines`/`hashtags`.
   */
  const inlineAutosavePayload = {
    defaultModel: 'gpt-5',
    persona: 'Agents for Test Brand',
    platformOverrides: {},
    strategy: {
      contentTypes: ['thread'],
      frequency: 'daily',
      goals: ['engagement'],
      platforms: ['twitter'],
    },
    voice: {
      approvedHooks: [],
      audience: ['founders'],
      bannedPhrases: [],
      canonicalSource: 'brand',
      doNotSoundLike: [],
      exemplarTexts: [],
      messagingPillars: [],
      sampleOutput: '',
      style: 'direct',
      tone: 'confident',
      values: ['clarity'],
      writingRules: [],
    },
  };

  it('accepts the inline agent-profile autosave payload', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send(inlineAutosavePayload);

    expect(response.status).toBe(200);
    expect(updateAgentConfig).toHaveBeenCalledTimes(1);
  });

  it('does not invent an enabledSkills value when the caller omits it', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send(inlineAutosavePayload)
      .expect(200);

    const [, , dto] = updateAgentConfig.mock.calls[0];
    expect(dto.enabledSkills).toBeUndefined();
  });

  it('accepts the publishing settings payload (autoPublish + schedule only)', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send({
        autoPublish: { confidenceThreshold: 0.8, enabled: true },
        schedule: {
          cronExpression: '0 9 * * *',
          enabled: true,
          timezone: 'UTC',
        },
      })
      .expect(200);

    expect(updateAgentConfig).toHaveBeenCalledTimes(1);
  });

  it('accepts the brand identity defaults payload', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send({
        defaultAvatarIngredientId: 'cmingredient000000000000001',
        defaultVoiceId: 'cmvoice0000000000000000001',
      })
      .expect(200);

    expect(updateAgentConfig).toHaveBeenCalledTimes(1);
  });

  it('accepts a single-field identity patch (default avatar only)', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send({ defaultAvatarIngredientId: 'cmingredient000000000000001' })
      .expect(200);

    expect(updateAgentConfig).toHaveBeenCalledTimes(1);
  });

  it('accepts the library voices default-voice payload, including a null clear', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send({ defaultVoiceId: null, defaultVoiceRef: null })
      .expect(200);

    expect(updateAgentConfig).toHaveBeenCalledTimes(1);
  });

  it('accepts the workspace composer facecam defaults payload', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send({ heygenAvatarId: 'avatar-abc', heygenVoiceId: 'voice-abc' })
      .expect(200);

    expect(updateAgentConfig).toHaveBeenCalledTimes(1);
  });

  it('accepts the agent configuration page payload (model + persona only)', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send({ defaultModel: 'gpt-5', persona: 'Ops copilot' })
      .expect(200);

    expect(updateAgentConfig).toHaveBeenCalledTimes(1);
  });

  it('accepts a partial voice patch from the manual brand kit card', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send({ voice: { style: 'punchy', tone: 'warm' } })
      .expect(200);

    expect(updateAgentConfig).toHaveBeenCalledTimes(1);
  });

  it('still rejects payloads that violate a declared field type', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send({ enabledSkills: 'content-writing' })
      .expect(400);

    expect(updateAgentConfig).not.toHaveBeenCalled();
  });

  it('rejects null enabledSkills instead of reaching the service', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send({ enabledSkills: null })
      .expect(400);

    expect(assertAccessibleSkillSlugs).not.toHaveBeenCalled();
    expect(updateAgentConfig).not.toHaveBeenCalled();
  });

  it('rejects duplicate enabled skill slugs', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config/enabled-skills`)
      .send({ enabledSkills: ['content-writing', 'content-writing'] })
      .expect(400);

    expect(assertAccessibleSkillSlugs).not.toHaveBeenCalled();
    expect(updateAgentConfig).not.toHaveBeenCalled();
  });

  it('also rejects duplicate enabled skill slugs on the general agent-config endpoint', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send({ enabledSkills: ['content-writing', 'content-writing'] })
      .expect(400);

    expect(assertAccessibleSkillSlugs).not.toHaveBeenCalled();
    expect(updateAgentConfig).not.toHaveBeenCalled();
  });

  it('rejects more than 100 enabled skill slugs', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config/enabled-skills`)
      .send({
        enabledSkills: Array.from(
          { length: 101 },
          (_, index) => `skill-${index}`,
        ),
      })
      .expect(400);

    expect(assertAccessibleSkillSlugs).not.toHaveBeenCalled();
    expect(updateAgentConfig).not.toHaveBeenCalled();
  });

  it('rejects blank enabled skill slugs', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config/enabled-skills`)
      .send({ enabledSkills: ['   '] })
      .expect(400);

    expect(assertAccessibleSkillSlugs).not.toHaveBeenCalled();
    expect(updateAgentConfig).not.toHaveBeenCalled();
  });

  it('accepts an empty enabled skill list', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config/enabled-skills`)
      .send({ enabledSkills: [] })
      .expect(200);

    expect(assertAccessibleSkillSlugs).toHaveBeenCalledWith(orgId, []);
    expect(updateAgentConfig).toHaveBeenCalledTimes(1);
  });

  it('still rejects a nested voice field of the wrong type', async () => {
    await request(app.getHttpServer())
      .patch(`/brands/${brandId}/agent-config`)
      .send({ voice: { tone: 42 } })
      .expect(400);

    expect(updateAgentConfig).not.toHaveBeenCalled();
  });
});
