import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ParsePromptDto } from '@api/collections/prompts/dto/parse-prompt.dto';
import type { PromptDocument } from '@api/collections/prompts/schemas/prompt.schema';
import { PromptTransformationService } from '@api/collections/prompts/services/prompt-transformation.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { PromptParser } from '@api/helpers/utils/prompt-parser/prompt-parser.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  ActivityKey,
  PromptCategory,
  PromptStatus,
  PromptTemplateKey,
  Status,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

describe('PromptTransformationService', () => {
  const promptId = testId('prompt');
  const remixId = testId('prompt', 2);
  const activityId = testId('activity');
  const brandId = testId('brand');
  const organizationId = testId('org');
  const userId = testId('user');
  const user = {
    brandId,
    id: 'user_123',
    organizationId,
    userId,
  } as unknown as User;
  const sourcePrompt = {
    brandId,
    category: PromptCategory.MODELS_PROMPT_IMAGE,
    id: promptId,
    organizationId,
    original: 'A mountain at sunrise',
    scope: 'USER',
    status: PromptStatus.GENERATED,
    userId,
  } as unknown as PromptDocument;
  const processingPrompt = {
    ...sourcePrompt,
    id: remixId,
    status: PromptStatus.PROCESSING,
  } as PromptDocument;
  const brand = {
    backgroundColor: '#000000',
    description: 'Outdoor brand',
    id: brandId,
    label: 'Summit',
    primaryColor: '#123456',
    secondaryColor: '#abcdef',
    text: 'Use an adventurous voice',
  };

  const activitiesService = {
    create: vi.fn(),
    patch: vi.fn(),
  };
  const brandsService = { findOne: vi.fn() };
  const creditsUtilsService = { refundOrganizationCredits: vi.fn() };
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const replicateService = { generateTextCompletionSync: vi.fn() };
  const promptBuilderService = { buildPrompt: vi.fn() };
  const promptsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const websocketService = {
    emit: vi.fn(),
    publishBackgroundTaskUpdate: vi.fn(),
  };
  const templatesService = { getRenderedPrompt: vi.fn() };

  const service = new PromptTransformationService(
    activitiesService as unknown as ActivitiesService,
    {} as ConfigService,
    brandsService as unknown as BrandsService,
    creditsUtilsService as unknown as CreditsUtilsService,
    loggerService as unknown as LoggerService,
    replicateService as unknown as ReplicateService,
    promptBuilderService as unknown as PromptBuilderService,
    promptsService as unknown as PromptsService,
    websocketService as unknown as NotificationsPublisherService,
    templatesService as unknown as TemplatesService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    activitiesService.create.mockResolvedValue({ id: activityId });
    activitiesService.patch.mockResolvedValue({});
    brandsService.findOne.mockResolvedValue(brand);
    creditsUtilsService.refundOrganizationCredits.mockResolvedValue({});
    replicateService.generateTextCompletionSync.mockResolvedValue(
      'Generated prompt',
    );
    promptBuilderService.buildPrompt.mockResolvedValue({ input: 'llm-input' });
    promptsService.create.mockResolvedValue(processingPrompt);
    promptsService.findOne.mockResolvedValue(sourcePrompt);
    promptsService.patch.mockResolvedValue(sourcePrompt);
    websocketService.emit.mockResolvedValue({});
    websocketService.publishBackgroundTaskUpdate.mockResolvedValue({});
    templatesService.getRenderedPrompt
      .mockResolvedValueOnce('System prompt')
      .mockResolvedValueOnce('Rendered remix prompt');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves parse brand authorization and parsed result', async () => {
    const dto = {
      brandId,
      category: PromptCategory.MODELS_PROMPT_IMAGE,
      original: 'A mountain at sunrise',
    } satisfies ParsePromptDto;

    const result = await service.parse(dto, user);

    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: brandId,
      OR: [{ userId }, { organizationId }],
    });
    expect(result).toEqual({
      normalizedType: PromptCategory.MODELS_PROMPT_IMAGE,
      promptString: expect.any(String),
    });
    expect(JSON.parse(result.promptString)).toEqual({
      brand: {
        backgroundColor: '#000000',
        description: 'Outdoor brand',
        label: 'Summit',
        primaryColor: '#123456',
        secondaryColor: '#abcdef',
        systemPrompt: 'Use an adventurous voice',
      },
      prompt: 'A mountain at sunrise',
    });
  });

  it('returns the processing remix before completing generation asynchronously', async () => {
    const request = { creditsConfig: { amount: 7 } } as unknown as Request;

    await expect(service.createRemix(request, promptId, user)).resolves.toBe(
      processingPrompt,
    );
    expect(promptsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        category: PromptCategory.MODELS_PROMPT_IMAGE,
        organizationId,
        original: sourcePrompt.original,
        status: PromptStatus.PROCESSING,
        userId,
      }),
    );
    expect(activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        key: ActivityKey.PROMPT_REMIX_PROCESSING,
        organizationId,
        userId,
      }),
    );
    expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId,
        room: getUserRoomName(user.id),
        status: 'processing',
        taskId: remixId,
      }),
    );

    await vi.waitFor(() =>
      expect(promptsService.patch).toHaveBeenCalledWith(remixId, {
        enhanced: 'Generated prompt',
        status: PromptStatus.GENERATED,
      }),
    );
    expect(activitiesService.patch).toHaveBeenCalledWith(
      activityId,
      expect.objectContaining({ key: ActivityKey.PROMPT_REMIX_COMPLETED }),
    );
    expect(websocketService.emit).toHaveBeenCalledWith(
      WebSocketPaths.prompt(remixId),
      { result: 'Generated prompt', status: Status.COMPLETED },
    );
    expect(
      creditsUtilsService.refundOrganizationCredits,
    ).not.toHaveBeenCalled();
  });

  it('uses the parsed prompt fallback when remix templates are unavailable', async () => {
    templatesService.getRenderedPrompt.mockReset();
    templatesService.getRenderedPrompt.mockRejectedValue(
      new Error('template missing'),
    );

    await service.createRemix({} as Request, promptId, user);

    await vi.waitFor(() =>
      expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          prompt: sourcePrompt.original,
          promptTemplate: PromptTemplateKey.TEXT_ENHANCEMENT,
        }),
        organizationId,
      ),
    );
    expect(loggerService.warn).toHaveBeenCalledWith(
      'Template not found, using fallback',
      expect.objectContaining({
        category: PromptCategory.MODELS_PROMPT_IMAGE,
      }),
    );
  });

  it('refunds the charged amount and emits failure only after remix generation fails', async () => {
    replicateService.generateTextCompletionSync.mockRejectedValue(
      new Error('generation failed'),
    );
    const request = { creditsConfig: { amount: 7 } } as unknown as Request;

    await expect(service.createRemix(request, promptId, user)).resolves.toBe(
      processingPrompt,
    );

    await vi.waitFor(() =>
      expect(
        creditsUtilsService.refundOrganizationCredits,
      ).toHaveBeenCalledWith(
        organizationId,
        7,
        'prompt-remix-refund',
        'Remix prompt generation failed - credit refund',
        expect.any(Date),
      ),
    );
    expect(activitiesService.patch).toHaveBeenCalledWith(
      activityId,
      expect.objectContaining({ key: ActivityKey.PROMPT_REMIX_FAILED }),
    );
    expect(promptsService.patch).toHaveBeenCalledWith(remixId, {
      status: PromptStatus.FAILED,
    });
    expect(websocketService.emit).toHaveBeenCalledWith(
      WebSocketPaths.prompt(remixId),
      { error: 'generation failed', status: Status.FAILED },
    );
  });

  it('preserves source prompt ownership authorization', async () => {
    promptsService.findOne.mockResolvedValue({
      ...sourcePrompt,
      userId: testId('other-user'),
    });

    await expect(
      service.createRemix({} as Request, promptId, user),
    ).rejects.toMatchObject({
      response: {
        detail: `PromptsOperationsController ${promptId} doesn't exist`,
        title: 'PromptsOperationsController not found',
      },
      status: HttpStatus.NOT_FOUND,
    });
    expect(activitiesService.create).not.toHaveBeenCalled();
    expect(replicateService.generateTextCompletionSync).not.toHaveBeenCalled();
  });

  it('adds cinematic guidance when enhancing an image prompt', async () => {
    const result = await service.enhanceExisting(promptId, user);

    expect(result).toBe(sourcePrompt);
    expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        systemPromptSuffix: expect.stringContaining(
          'Cinematography vocabulary',
        ),
      }),
      organizationId,
    );
    expect(activitiesService.patch).toHaveBeenCalledWith(activityId, {
      key: ActivityKey.PROMPT_ENHANCE_COMPLETED,
      value: JSON.stringify({
        progress: 100,
        promptId,
        type: 'enhance',
      }),
    });
    expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId,
        room: getUserRoomName(user.id),
        status: 'processing',
        taskId: promptId,
      }),
    );
  });

  it('omits cinematic guidance when enhancing a text prompt', async () => {
    promptsService.findOne.mockResolvedValue({
      ...sourcePrompt,
      category: PromptCategory.PRESET_DESCRIPTION_TEXT,
    });

    await service.enhanceExisting(promptId, user);

    const buildOptions = promptBuilderService.buildPrompt.mock.calls[0]?.[1];
    expect(buildOptions).not.toHaveProperty('systemPromptSuffix');
  });

  it('preserves enhancement failure activity, status, and error response', async () => {
    replicateService.generateTextCompletionSync.mockRejectedValue(
      new Error('generation failed'),
    );

    await expect(service.enhanceExisting(promptId, user)).rejects.toMatchObject(
      {
        response: expect.objectContaining({ message: 'generation failed' }),
        status: HttpStatus.BAD_REQUEST,
      },
    );
    expect(activitiesService.patch).toHaveBeenCalledWith(
      activityId,
      expect.objectContaining({ key: ActivityKey.PROMPT_ENHANCE_FAILED }),
    );
    expect(promptsService.patch).toHaveBeenCalledWith(promptId, {
      status: PromptStatus.FAILED,
    });
  });

  it('uses the legacy system template key for stored categories', async () => {
    const keySpy = vi.spyOn(PromptParser, 'getSystemPromptTemplateKey');

    await service.enhanceExisting(promptId, user);

    expect(keySpy).toHaveBeenCalledWith(PromptCategory.MODELS_PROMPT_IMAGE);
  });
});
