vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, data) => ({ data })),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PromptsTransformationsController } from '@api/collections/prompts/controllers/prompts-transformations.controller';
import type { ParsePromptDto } from '@api/collections/prompts/dto/parse-prompt.dto';
import { PromptTransformationService } from '@api/collections/prompts/services/prompt-transformation.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { PromptCategory } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PromptsTransformationsController', () => {
  let controller: PromptsTransformationsController;

  const promptId = testId('prompt');
  const request = {} as Request;
  const user = {
    brandId: testId('brand'),
    id: 'user_123',
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;
  const prompt = {
    id: promptId,
    organizationId: user.organizationId,
    original: 'A mountain at sunrise',
    userId: user.userId,
  };
  const transformationService = {
    createRemix: vi.fn().mockResolvedValue(prompt),
    enhanceExisting: vi.fn().mockResolvedValue(prompt),
    parse: vi.fn().mockResolvedValue({
      normalizedType: PromptCategory.MODELS_PROMPT_IMAGE,
      promptString: '{"prompt":"A mountain at sunrise"}',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromptsTransformationsController],
      providers: [
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        {
          provide: PromptTransformationService,
          useValue: transformationService,
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get(PromptsTransformationsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates prompt parsing unchanged', async () => {
    const dto = {
      category: PromptCategory.MODELS_PROMPT_IMAGE,
      original: 'A mountain at sunrise',
    } satisfies ParsePromptDto;

    await expect(controller.parse(dto, user)).resolves.toEqual({
      normalizedType: PromptCategory.MODELS_PROMPT_IMAGE,
      promptString: '{"prompt":"A mountain at sunrise"}',
    });
    expect(transformationService.parse).toHaveBeenCalledWith(dto, user);
  });

  it('delegates remix creation and preserves the serialized envelope', async () => {
    await expect(
      controller.createRemix(request, promptId, user),
    ).resolves.toEqual({ data: prompt });
    expect(transformationService.createRemix).toHaveBeenCalledWith(
      request,
      promptId,
      user,
    );
  });

  it('delegates enhancement and preserves the serialized envelope', async () => {
    await expect(
      controller.enhanceExisting(request, promptId, user),
    ).resolves.toEqual({ data: prompt });
    expect(transformationService.enhanceExisting).toHaveBeenCalledWith(
      promptId,
      user,
    );
  });
});
