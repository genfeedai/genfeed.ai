vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, data) => ({ data })),
}));

import { MusicGenerationService } from '@api/collections/musics/services/music-generation.service';
import { MusicGenerationCreditsService } from '@api/collections/musics/services/music-generation-credits.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import {
  ActivityKey,
  IngredientStatus,
  ModelCategory,
  PromptCategory,
  RouterPriority,
} from '@genfeedai/enums';
import { MusicSerializer } from '@genfeedai/serializers';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { CreateMusicDto } from '@server/collections/musics/dto/create-music.dto';
import { PollTimeoutException } from '@server/shared/services/poll-until/poll-until.exception';
import type { Request } from 'express';

describe('MusicGenerationService', () => {
  const user = {
    brandId: 'brand-from-user',
    id: 'auth-user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as User;
  const request = {
    originalUrl: '/api/musics',
    selectedModel: { category: ModelCategory.MUSIC },
  } as unknown as Request;

  const buildDto = (overrides: Partial<CreateMusicDto> = {}): CreateMusicDto =>
    Object.assign(new CreateMusicDto(), {
      duration: 10,
      model: 'explicit-model',
      outputs: 1,
      seed: 42,
      text: 'Generate happy background music',
      ...overrides,
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createService = () => {
    let mediaCount = 0;
    let generationCount = 0;
    const activitiesService = {
      create: vi.fn().mockResolvedValue({ id: 'activity-1' }),
    };
    const brandsService = {
      findOne: vi.fn().mockResolvedValue({
        defaultMusicModel: 'brand-model',
        id: 'brand-from-user',
      }),
    };
    const creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
    };
    const failedGenerationService = {
      handleFailedMusicGeneration: vi.fn().mockResolvedValue(undefined),
    };
    const ingredientCompletionService = {
      waitForMultipleIngredientsCompletion: vi.fn(),
    };
    const loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };
    const metadataService = {
      patch: vi.fn().mockResolvedValue(undefined),
    };
    const modelsService = {
      findOne: vi.fn().mockResolvedValue({ cost: 7 }),
    };
    const musicsService = {
      patch: vi.fn().mockResolvedValue(undefined),
    };
    const organizationSettingsService = {
      findOne: vi
        .fn()
        .mockResolvedValue({ defaultMusicModel: 'organization-model' }),
    };
    const promptBuilderService = {
      buildPrompt: vi.fn().mockResolvedValue({
        input: { prompt: 'provider-ready prompt' },
      }),
    };
    const promptsService = {
      create: vi.fn().mockImplementation((prompt) =>
        Promise.resolve({
          ...prompt,
          id: 'prompt-1',
        }),
      ),
    };
    const replicateService = {
      runModel: vi.fn().mockImplementation(() => {
        generationCount += 1;
        return Promise.resolve(`generation-${generationCount}`);
      }),
    };
    const routerService = {
      getDefaultModel: vi.fn().mockResolvedValue('system-model'),
      selectModel: vi.fn().mockResolvedValue({
        reason: 'best match',
        selectedModel: 'auto-model',
      }),
    };
    const sharedService = {
      createMediaDocuments: vi.fn().mockImplementation(() => {
        mediaCount += 1;
        return Promise.resolve({
          ingredientData: {
            id: `music-${mediaCount}`,
            status: IngredientStatus.PROCESSING,
          },
          metadataData: { id: `metadata-${mediaCount}` },
        });
      }),
    };
    const websocketService = {
      publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
    };

    const creditsService = new MusicGenerationCreditsService(
      creditsUtilsService as never,
      loggerService as never,
      modelsService as never,
    );
    const service = new MusicGenerationService(
      activitiesService as never,
      brandsService as never,
      creditsService,
      failedGenerationService as never,
      loggerService as never,
      ingredientCompletionService as never,
      metadataService as never,
      organizationSettingsService as never,
      musicsService as never,
      promptsService as never,
      promptBuilderService as never,
      replicateService as never,
      routerService as never,
      sharedService as never,
      websocketService as never,
    );

    return {
      activitiesService,
      brandsService,
      creditsUtilsService,
      failedGenerationService,
      ingredientCompletionService,
      loggerService,
      metadataService,
      modelsService,
      musicsService,
      organizationSettingsService,
      promptBuilderService,
      promptsService,
      replicateService,
      routerService,
      service,
      sharedService,
      websocketService,
    };
  };

  it('persists and dispatches a music generation successfully', async () => {
    const created = createService();

    const response = await created.service.generateMusic(
      user,
      buildDto(),
      request,
    );

    expect(created.promptsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: PromptCategory.MODELS_PROMPT_MUSIC,
        model: 'explicit-model',
        original: 'Generate happy background music',
      }),
    );
    expect(created.sharedService.createMediaDocuments).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        generationPrompt: 'Generate happy background music',
        model: 'explicit-model',
        organizationId: 'org-1',
        promptId: 'prompt-1',
      }),
    );
    expect(created.activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ key: ActivityKey.MUSIC_PROCESSING }),
    );
    expect(
      created.websocketService.publishBackgroundTaskUpdate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'processing',
        taskId: 'music-1',
      }),
    );
    expect(created.promptBuilderService.buildPrompt).toHaveBeenCalledWith(
      'explicit-model',
      {
        duration: 10,
        modelCategory: ModelCategory.MUSIC,
        prompt: 'Generate happy background music',
        seed: 42,
      },
    );
    expect(created.replicateService.runModel).toHaveBeenCalledWith(
      'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb',
      { prompt: 'provider-ready prompt' },
    );
    expect(created.metadataService.patch).toHaveBeenCalledWith('metadata-1', {
      externalId: 'generation-1',
    });
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      MusicSerializer,
      expect.objectContaining({
        id: 'music-1',
        pendingIngredientIds: ['music-1'],
      }),
    );
    expect(response).toEqual({
      data: expect.objectContaining({
        id: 'music-1',
        pendingIngredientIds: ['music-1'],
      }),
    });
  });

  it('rejects a missing prompt with the existing 400 response', async () => {
    const { service, promptsService } = createService();

    try {
      await service.generateMusic(user, buildDto({ text: undefined }), request);
      expect.fail('Expected prompt validation to reject');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((error as HttpException).getResponse()).toEqual({
        detail: 'Prompt is required',
        title: 'Prompt validation failed',
      });
    }
    expect(promptsService.create).not.toHaveBeenCalled();
  });

  it('uses auto-routing ahead of every configured default', async () => {
    const created = createService();
    const dto = buildDto({
      autoSelectModel: true,
      model: 'ignored-explicit-model',
      outputs: 2,
      prioritize: RouterPriority.QUALITY,
    });

    await created.service.generateMusic(user, dto, request);

    expect(created.routerService.selectModel).toHaveBeenCalledWith({
      category: ModelCategory.MUSIC,
      organizationId: 'org-1',
      outputs: 2,
      prioritize: RouterPriority.QUALITY,
      prompt: dto.text,
    });
    expect(created.routerService.getDefaultModel).not.toHaveBeenCalled();
    expect(created.promptsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'auto-model' }),
    );
  });

  it.each([
    {
      brandDefault: 'brand-model',
      explicit: 'explicit-model',
      expected: 'explicit-model',
      organizationDefault: 'organization-model',
    },
    {
      brandDefault: 'brand-model',
      explicit: undefined,
      expected: 'brand-model',
      organizationDefault: 'organization-model',
    },
    {
      brandDefault: undefined,
      explicit: undefined,
      expected: 'organization-model',
      organizationDefault: 'organization-model',
    },
    {
      brandDefault: undefined,
      explicit: undefined,
      expected: 'system-model',
      organizationDefault: undefined,
    },
  ])(
    'resolves the default model precedence to $expected',
    async ({ brandDefault, explicit, expected, organizationDefault }) => {
      const created = createService();
      created.brandsService.findOne.mockResolvedValue({
        defaultMusicModel: brandDefault,
        id: 'brand-from-user',
      } as never);
      created.organizationSettingsService.findOne.mockResolvedValue(
        (organizationDefault
          ? { defaultMusicModel: organizationDefault }
          : undefined) as never,
      );

      await created.service.generateMusic(
        user,
        buildDto({ model: explicit }),
        request,
      );

      expect(created.promptsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: expected }),
      );
    },
  );

  it('clamps outputs to four and continues after a partial provider failure', async () => {
    const created = createService();
    created.replicateService.runModel
      .mockResolvedValueOnce('generation-1')
      .mockRejectedValueOnce(new Error('second output failed'))
      .mockResolvedValueOnce('generation-3')
      .mockResolvedValueOnce('generation-4');

    const response = await created.service.generateMusic(
      user,
      buildDto({ outputs: 9, seed: 100 }),
      request,
    );

    expect(created.sharedService.createMediaDocuments).toHaveBeenCalledTimes(4);
    expect(created.replicateService.runModel).toHaveBeenCalledTimes(4);
    expect(created.promptBuilderService.buildPrompt.mock.calls).toEqual([
      ['explicit-model', expect.objectContaining({ seed: 100 })],
      ['explicit-model', expect.objectContaining({ seed: 101 })],
      ['explicit-model', expect.objectContaining({ seed: 102 })],
      ['explicit-model', expect.objectContaining({ seed: 103 })],
    ]);
    expect(
      created.failedGenerationService.handleFailedMusicGeneration,
    ).toHaveBeenCalledOnce();
    expect(
      created.failedGenerationService.handleFailedMusicGeneration,
    ).toHaveBeenCalledWith(
      created.musicsService,
      'music-2',
      expect.any(String),
      'auth-user-1',
      expect.any(String),
      expect.objectContaining({ key: ActivityKey.MUSIC_FAILED }),
    );
    expect(response).toEqual({
      data: expect.objectContaining({
        pendingIngredientIds: ['music-1', 'music-2', 'music-3', 'music-4'],
      }),
    });
  });

  it('clamps outputs to one and preserves the random-seed sentinel', async () => {
    const created = createService();

    await created.service.generateMusic(
      user,
      buildDto({ outputs: 0, seed: undefined }),
      request,
    );

    expect(created.sharedService.createMediaDocuments).toHaveBeenCalledOnce();
    expect(created.promptBuilderService.buildPrompt).toHaveBeenCalledOnce();
    expect(created.promptBuilderService.buildPrompt).toHaveBeenCalledWith(
      'explicit-model',
      expect.objectContaining({ seed: -1 }),
    );
  });

  it('settles output credits after the primary generation starts', async () => {
    const created = createService();

    await created.service.generateMusic(
      user,
      buildDto({ outputs: 3 }),
      request,
    );

    expect(
      created.creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledOnce();
    expect(
      created.creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      21,
      'Music generation - explicit-model (3 outputs)',
      expect.any(String),
    );
    expect(
      created.metadataService.patch.mock.invocationCallOrder[0],
    ).toBeLessThan(
      created.creditsUtilsService.deductCreditsFromOrganization.mock
        .invocationCallOrder[0],
    );
    expect(
      created.creditsUtilsService.deductCreditsFromOrganization.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      created.replicateService.runModel.mock.invocationCallOrder[1],
    );
  });

  it('does not deduct credits when the primary generation cannot start', async () => {
    const created = createService();
    created.replicateService.runModel.mockResolvedValue(null as never);

    await created.service.generateMusic(
      user,
      buildDto({ outputs: 3 }),
      request,
    );

    expect(
      created.creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(created.sharedService.createMediaDocuments).toHaveBeenCalledOnce();
    expect(
      created.failedGenerationService.handleFailedMusicGeneration,
    ).toHaveBeenCalledOnce();
  });

  it('maps the existing polling timeout to a 504 response', async () => {
    const created = createService();
    created.ingredientCompletionService.waitForMultipleIngredientsCompletion.mockRejectedValue(
      new PollTimeoutException('Polling timeout', 180_000),
    );

    try {
      await created.service.generateMusic(
        user,
        buildDto({ waitForCompletion: true }),
        request,
      );
      expect.fail('Expected completion polling to time out');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.GATEWAY_TIMEOUT,
      );
      expect((error as HttpException).getResponse()).toEqual({
        detail:
          'Music generation did not complete within 3 minutes. Current status: PROCESSING',
        title: 'Generation timeout',
      });
    }
    expect(
      created.ingredientCompletionService.waitForMultipleIngredientsCompletion,
    ).toHaveBeenCalledWith(['music-1'], 180_000, 3_000, expect.any(Array));
  });
});
