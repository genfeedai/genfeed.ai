import { WorkflowGenerationService } from '@api/collections/workflows/services/workflow-generation.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

vi.mock('@api/collections/workflows/registry/node-registry-adapter', () => ({
  UNIFIED_NODE_REGISTRY: {
    disabled_node: {
      category: 'legacy',
      description: 'Old node',
      inputs: {},
      isEnabled: false,
      outputs: {},
    },
    image_gen: {
      category: 'generation',
      description: 'Generate image',
      inputs: { prompt: {} },
      isEnabled: true,
      outputs: { imageUrl: {} },
    },
    text_to_video: {
      category: 'generation',
      description: 'Generate video from text',
      inputs: { prompt: {} },
      isEnabled: true,
      outputs: { videoUrl: {} },
    },
  },
}));

vi.mock('@api/services/integrations/openrouter/dto/openrouter.dto', () => ({
  getDefaultModel: vi.fn(() => 'openai/gpt-4o'),
  OpenRouterModelTier: { STANDARD: 'standard' },
}));

const makeOpenRouterResponse = (content: string, tokens = 500) => ({
  choices: [{ message: { content } }],
  usage: { total_tokens: tokens },
});

describe('WorkflowGenerationService', () => {
  let service: WorkflowGenerationService;
  let openRouterService: vi.Mocked<Pick<OpenRouterService, 'chatCompletion'>>;

  const validWorkflow = {
    description: 'Generates short-form video',
    edges: [
      {
        id: 'e1',
        source: 'n1',
        sourceHandle: 'prompt',
        target: 'n2',
        targetHandle: 'prompt',
      },
    ],
    name: 'Short Video Workflow',
    nodes: [
      {
        data: { config: {}, label: 'Input' },
        id: 'n1',
        position: { x: 0, y: 0 },
        type: 'text_to_video',
      },
    ],
  };

  beforeEach(async () => {
    openRouterService = {
      chatCompletion: vi
        .fn()
        .mockResolvedValue(
          makeOpenRouterResponse(JSON.stringify(validWorkflow)),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowGenerationService,
        { provide: OpenRouterService, useValue: openRouterService },
      ],
    }).compile();

    service = module.get<WorkflowGenerationService>(WorkflowGenerationService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateWorkflowFromDescription', () => {
    it('returns parsed workflow JSON on success', async () => {
      const result = await service.generateWorkflowFromDescription({
        description: 'Create a short video workflow',
      });
      expect(result.workflow).toEqual(validWorkflow);
    });

    it('returns token count from LLM response', async () => {
      const result = await service.generateWorkflowFromDescription({
        description: 'Generate some content',
      });
      expect(result.tokensUsed).toBe(500);
    });

    it('calls openRouter with system + user messages', async () => {
      await service.generateWorkflowFromDescription({
        description: 'A cool workflow',
      });
      expect(openRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({
              content: 'A cool workflow',
              role: 'user',
            }),
          ]),
        }),
      );
    });

    it('includes platform constraint in system prompt when platforms provided', async () => {
      await service.generateWorkflowFromDescription({
        description: 'TikTok workflow',
        targetPlatforms: ['tiktok', 'instagram'],
      });
      const call = openRouterService.chatCompletion.mock.calls[0][0];
      const systemMsg = call.messages.find(
        (m: { role: string }) => m.role === 'system',
      );
      expect(systemMsg?.content).toContain('tiktok');
      expect(systemMsg?.content).toContain('instagram');
    });

    it('omits disabled nodes from available types in prompt', async () => {
      await service.generateWorkflowFromDescription({
        description: 'Any workflow',
      });
      const call = openRouterService.chatCompletion.mock.calls[0][0];
      const systemMsg = call.messages.find(
        (m: { role: string }) => m.role === 'system',
      );
      expect(systemMsg?.content).not.toContain('disabled_node');
    });

    it('throws HttpException when LLM returns invalid JSON', async () => {
      openRouterService.chatCompletion.mockResolvedValue(
        makeOpenRouterResponse('not valid json {{ broken'),
      );
      await expect(
        service.generateWorkflowFromDescription({ description: 'test' }),
      ).rejects.toThrow(HttpException);
    });

    it('throws HttpException with UNPROCESSABLE_ENTITY status on parse failure', async () => {
      openRouterService.chatCompletion.mockResolvedValue(
        makeOpenRouterResponse('{{invalid}}'),
      );
      await expect(
        service.generateWorkflowFromDescription({ description: 'test' }),
      ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    });

    it('returns 0 tokens when usage is missing', async () => {
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(validWorkflow) } }],
        usage: undefined,
      });
      const result = await service.generateWorkflowFromDescription({
        description: 'test',
      });
      expect(result.tokensUsed).toBe(0);
    });

    it('handles empty LLM response gracefully (returns empty object)', async () => {
      openRouterService.chatCompletion.mockResolvedValue(
        makeOpenRouterResponse('{}'),
      );
      const result = await service.generateWorkflowFromDescription({
        description: 'edge case',
      });
      expect(result.workflow).toEqual({});
    });
  });
});
