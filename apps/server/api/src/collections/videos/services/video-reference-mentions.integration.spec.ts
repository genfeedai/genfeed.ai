import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { CrunVideoGenerationService } from '@api/collections/videos/services/crun-video-generation.service';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import { VideoGenerationCompletionService } from '@api/collections/videos/services/video-generation-completion.service';
import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import { VideoGenerationExecutionService } from '@api/collections/videos/services/video-generation-execution.service';
import { VideoGenerationPreparationService } from '@api/collections/videos/services/video-generation-preparation.service';
import { VideoReferenceUrlService } from '@api/collections/videos/services/video-reference-url.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MediaPromptEnhancementService } from '@api/services/harness/media-prompt-enhancement.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';
import { ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { UnprocessableEntityException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ORG = testId('org');
const BRAND = testId('brand');
const USER: AuthenticatedUser = {
  id: testId('user'),
  userId: testId('user'),
  organizationId: ORG,
  brandId: BRAND,
};
const PERSON = testId('ingredient', 1);
const LOCATION = testId('ingredient', 2);
const CHARACTER = testId('ingredient', 3);
const DRIVER = testId('ingredient', 4);
const VOICE = testId('ingredient', 5);
const FIRST_FRAME = testId('ingredient', 6);
const LAST_FRAME = testId('ingredient', 7);
const ORIGINAL =
  'Use @Image2 behind @Image1 with @Video1 and @Audio1. Anna remains the character.';
const RETAINED =
  'Animate Anna with @Audio1 and @Video1, keeping @Image1 in front of @Image2.';
const RESPONSE = {
  data: { type: 'ingredients', id: testId('ingredient', 8) },
} satisfies JsonApiSingleResponse;
const modules: TestingModule[] = [];

function imageUrl(id: string): string {
  return `https://media.fixture.test/images/${id}`;
}
function storedUrl(id: string): string {
  return `https://media.fixture.test/fixtures/${id}`;
}

function videoRequest(overrides: Partial<CreateVideoDto> = {}): CreateVideoDto {
  const values = {
    model: MODEL_KEYS.REPLICATE_MINIMAX_H3,
    text: ORIGINAL,
    references: [PERSON, LOCATION, CHARACTER],
    videoReferences: [DRIVER],
    audioReferences: [VOICE],
    harness: true,
    brandingMode: 'off',
    isBrandingEnabled: false,
    duration: 5,
    resolution: '2K',
    outputs: 1,
    width: 1920,
    height: 1080,
    ...overrides,
  } satisfies Partial<CreateVideoDto>;
  return Object.assign(new CreateVideoDto(), values);
}

function httpRequest(dto: CreateVideoDto): RequestWithContext {
  // Per-app Express request prototype: no listener, socket, or network request.
  const request: RequestWithContext = express().request;
  request.originalUrl = '/v1/videos';
  request.body = dto;
  request.user = USER;
  return request;
}

async function fixture(preparedText: string) {
  const assets = new Map(
    [PERSON, LOCATION, CHARACTER, DRIVER, VOICE, FIRST_FRAME, LAST_FRAME].map(
      (id) => [
        id,
        {
          id,
          s3Key: `fixtures/${id}`,
          metadata: { duration: 5 },
        },
      ],
    ),
  );
  const references = {
    resolveUrl: vi
      .fn<VideoReferenceUrlService['resolveUrl']>()
      .mockImplementation(async ({ referenceId }) =>
        assets.has(referenceId) ? imageUrl(referenceId) : null,
      ),
    resolveUrls: vi
      .fn<VideoReferenceUrlService['resolveUrls']>()
      .mockImplementation(async ({ referenceIds }) =>
        referenceIds.map(imageUrl),
      ),
  };
  const brands = {
    findOne: vi.fn(async (..._args: Parameters<BrandsService['findOne']>) => ({
      id: BRAND,
      organizationId: ORG,
      label: 'Synthetic brand',
    })),
  };
  const ingredients = {
    findOne: vi.fn(
      async (query: Parameters<IngredientsService['findOne']>[0]) => {
        if (
          query.organizationId !== ORG ||
          query.isDeleted !== false ||
          typeof query.id !== 'string'
        )
          return null;
        return assets.get(query.id) ?? null;
      },
    ),
  };
  const modelRegistration = {
    validateModelForOrg: vi.fn(
      async (
        ..._args: Parameters<ModelRegistrationService['validateModelForOrg']>
      ) => ({
        endpoint: MODEL_KEYS.REPLICATE_MINIMAX_H3,
        provider: ModelProvider.REPLICATE,
      }),
    ),
  };
  const files = {
    getPresignedDownloadUrlForObjectKey: vi
      .fn<FilesClientService['getPresignedDownloadUrlForObjectKey']>()
      .mockImplementation(async (key) => `https://media.fixture.test/${key}`),
    getPresignedDownloadUrl: vi
      .fn<FilesClientService['getPresignedDownloadUrl']>()
      .mockImplementation(async (id) => storedUrl(id)),
  };
  const personas = personasServiceStub();
  const enhance = vi
    .fn<MediaPromptEnhancementService['enhance']>()
    .mockImplementation(async (input) => ({
      originalPrompt: input.prompt,
      enhancedPrompt: input.harness === false ? input.prompt : preparedText,
      brandId: input.brandId,
      status: input.harness === false ? 'skipped' : 'applied',
      source: 'request',
      appliedPacks: [],
    }));
  const prompts = {
    create: vi.fn(async (..._args: Parameters<PromptsService['create']>) => ({
      id: testId('prompt'),
    })),
  };
  const media = {
    createMediaDocuments: vi.fn(
      async (..._args: Parameters<SharedService['createMediaDocuments']>) => ({
        ingredientData: { id: RESPONSE.data.id },
        metadataData: { id: testId('metadata') },
      }),
    ),
  };
  const credits = {
    ensureDeferredCredits: vi
      .fn<VideoGenerationCreditsService['ensureDeferredCredits']>()
      .mockResolvedValue(undefined),
  };
  const execution = {
    execute: vi
      .fn<VideoGenerationExecutionService['execute']>()
      .mockResolvedValue(undefined),
    prepareProviderDispatch:
      vi.fn<VideoGenerationExecutionService['prepareProviderDispatch']>(),
    failPlaceholderBeforeDispatch: vi
      .fn<VideoGenerationExecutionService['failPlaceholderBeforeDispatch']>()
      .mockImplementation(async (_context, error) => {
        throw error;
      }),
  };
  const complete = vi
    .fn<VideoGenerationCompletionService['complete']>()
    .mockResolvedValue(RESPONSE);
  const promptBuilder = {
    buildPrompt: vi
      .fn<PromptBuilderService['buildPrompt']>()
      .mockRejectedValue(new Error('Unexpected legacy prompt-builder path')),
  };
  const module = await Test.createTestingModule({
    providers: [
      VideoGenerationService,
      VideoGenerationPreparationService,
      { provide: VideoReferenceUrlService, useValue: references },
      { provide: BrandsService, useValue: brands },
      {
        provide: ConfigService,
        useValue: { isAuthorizedMediaDeliveryEnabled: true },
      },
      { provide: FilesClientService, useValue: files },
      { provide: IngredientsService, useValue: ingredients },
      {
        provide: LoggerService,
        useValue: {
          debug: vi.fn(),
          error: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
        },
      },
      { provide: ModelRegistrationService, useValue: modelRegistration },
      {
        provide: OrganizationSettingsService,
        useValue: { findOne: vi.fn(async () => null) },
      },
      { provide: PersonasService, useValue: personas },
      { provide: PromptBuilderService, useValue: promptBuilder },
      { provide: PromptsService, useValue: prompts },
      {
        provide: RouterService,
        useValue: {
          getDefaultModel: vi.fn(async () => MODEL_KEYS.REPLICATE_MINIMAX_H3),
        },
      },
      { provide: SharedService, useValue: media },
      {
        provide: TemplatesService,
        useValue: { getPromptByKey: vi.fn(async () => null) },
      },
      { provide: MediaPromptEnhancementService, useValue: { enhance } },
      { provide: VideoGenerationCompletionService, useValue: { complete } },
      { provide: VideoGenerationCreditsService, useValue: credits },
      { provide: VideoGenerationExecutionService, useValue: execution },
      {
        provide: VideosService,
        useValue: { findOne: vi.fn(), patch: vi.fn() },
      },
      { provide: CrunVideoGenerationService, useValue: { generate: vi.fn() } },
    ],
  }).compile();
  modules.push(module);
  return {
    service: module.get(VideoGenerationService),
    enhance,
    credits,
    execution,
    media,
    prompts,
    personas,
    ingredients,
    promptBuilder,
    complete,
  };
}

afterEach(async () => {
  await Promise.all(modules.splice(0).map((module) => module.close()));
});

describe('reference mentions through public video submission and real preparation', () => {
  it('keeps H3 Image1/Image2 aligned with ordered dispatch images and appends character images without changing enhancement', async () => {
    const f = await fixture(RETAINED);
    const dto = videoRequest();
    await expect(
      f.service.generateVideo(USER, dto, httpRequest(dto)),
    ).resolves.toEqual(RESPONSE);
    expect(f.enhance).toHaveBeenCalledWith(
      expect.objectContaining({ harness: true, prompt: ORIGINAL }),
    );
    expect(f.personas.resolveCharacterReferences).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientIds: [PERSON, LOCATION, CHARACTER, DRIVER],
        organizationId: ORG,
      }),
    );
    expect(f.execution.execute).toHaveBeenCalledOnce();
    const context = f.execution.execute.mock.calls[0]?.[0];
    expect(context?.promptParams).toMatchObject({
      reference_image_urls: [
        imageUrl(PERSON),
        imageUrl(LOCATION),
        imageUrl(CHARACTER),
      ],
      reference_video_urls: [storedUrl(DRIVER)],
      reference_audio_urls: [storedUrl(VOICE)],
    });
    expect(context?.promptParams).not.toHaveProperty('first_frame_image');
    expect(context?.promptParams.prompt).toMatch(
      /@Audio1.*@Video1.*@Image1.*@Image2/,
    );
    expect(f.credits.ensureDeferredCredits).toHaveBeenCalledOnce();
    expect(f.promptBuilder.buildPrompt).not.toHaveBeenCalled();
  });

  it.each([
    ['stripped', 'Animate Anna with @Image1, @Video1 and @Audio1.'],
    ['invented', `${RETAINED} Add @Image3.`],
    ['renumbered', RETAINED.replace('@Image2', '@Image4')],
  ])(
    'refuses %s enhancement tokens before output creation, credit admission and provider execution',
    async (_label, preparedText) => {
      const f = await fixture(preparedText);
      const dto = videoRequest();
      let error: unknown;
      try {
        await f.service.generateVideo(USER, dto, httpRequest(dto));
      } catch (caught) {
        error = caught;
      }
      expect
        .soft(f.enhance)
        .toHaveBeenCalledWith(
          expect.objectContaining({ harness: true, prompt: ORIGINAL }),
        );
      expect.soft(f.prompts.create).not.toHaveBeenCalled();
      expect.soft(f.media.createMediaDocuments).not.toHaveBeenCalled();
      expect.soft(f.credits.ensureDeferredCredits).not.toHaveBeenCalled();
      expect.soft(f.execution.prepareProviderDispatch).not.toHaveBeenCalled();
      expect.soft(f.execution.execute).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      if (!(error instanceof UnprocessableEntityException))
        throw new Error(
          'Expected the post-enhancement reference invariant error',
        );
      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toMatchObject({
        code: 'REFERENCE_MENTION_ENHANCEMENT_CHANGED',
      });
    },
  );

  it('preserves the explicit raw choice while retaining positional image-array alignment', async () => {
    const f = await fixture('An ignored enhancement result');
    const dto = videoRequest({ harness: false });
    await expect(
      f.service.generateVideo(USER, dto, httpRequest(dto)),
    ).resolves.toEqual(RESPONSE);
    expect(f.enhance).toHaveBeenCalledWith(
      expect.objectContaining({ harness: false }),
    );
    const context = f.execution.execute.mock.calls[0]?.[0];
    expect(context?.promptParams).toMatchObject({
      reference_image_urls: [
        imageUrl(PERSON),
        imageUrl(LOCATION),
        imageUrl(CHARACTER),
      ],
    });
    expect(context?.promptParams).not.toHaveProperty('first_frame_image');
  });

  it('keeps ordinary first/end-frame transport and appended character references unchanged', async () => {
    const text = 'Move from the first frame to the last while retaining Anna.';
    const f = await fixture(text);
    const dto = videoRequest({
      text,
      references: [FIRST_FRAME, CHARACTER],
      endFrame: LAST_FRAME,
      videoReferences: [],
      audioReferences: [],
      harness: false,
    });
    await expect(
      f.service.generateVideo(USER, dto, httpRequest(dto)),
    ).resolves.toEqual(RESPONSE);
    expect(f.execution.execute.mock.calls[0]?.[0].promptParams).toMatchObject({
      first_frame_image: imageUrl(FIRST_FRAME),
      last_frame_image: imageUrl(LAST_FRAME),
      reference_image_urls: [imageUrl(CHARACTER)],
      reference_video_urls: [],
      reference_audio_urls: [],
    });
    expect(f.credits.ensureDeferredCredits).toHaveBeenCalledOnce();
    expect(f.enhance).toHaveBeenCalledWith(
      expect.objectContaining({ harness: false, prompt: text }),
    );
  });
});
