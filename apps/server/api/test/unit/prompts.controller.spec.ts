import { PromptsController } from '@api/collections/prompts/prompts.controller';

vi.mock('@helpers/utils/deserializer/deserializer.util', () => ({
  getDeserializer: vi.fn((value) => Promise.resolve(value)),
}));

vi.mock('@helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439012',
  }),
}));

describe('PromptsController', () => {
  let controller: PromptsController;

  beforeEach(() => {
    const configService = { get: vi.fn().mockReturnValue('1') };
    const accountsService = {};
    const creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
    };
    const promptsService = {
      create: vi.fn().mockResolvedValue(undefined),
    };
    const ingredientsService = {};
    const loggerService = { error: vi.fn(), log: vi.fn() };
    const openaiService = {
      postResponse: vi.fn().mockResolvedValue({ result: 'Generated reply' }),
    };
    const whisperService = {};
    const websocketService = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    controller = new PromptsController(
      configService,
      accountsService,
      creditsUtilsService,
      promptsService,
      ingredientsService,
      loggerService,
      openaiService,
      whisperService,
      websocketService,
    );
  });

  it('should prefix @grok when tagGrok is true', async () => {
    const dto = {
      tagGrok: true,
      tweetContent: 'Hello world',
    };

    const result = await controller.generateTweetReply(dto, {});

    expect(result.reply).toBe('@grok Generated reply');
  });
});
