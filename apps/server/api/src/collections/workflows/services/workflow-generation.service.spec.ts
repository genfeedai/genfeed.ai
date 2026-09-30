import { WorkflowFormatConverterService } from '@api/collections/workflows/services/workflow-format-converter.service';
import { WorkflowGenerationService } from '@api/collections/workflows/services/workflow-generation.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

vi.mock('@api/services/integrations/openrouter/dto/openrouter.dto', () => ({
  getDefaultModel: vi.fn(() => 'openai/gpt-5.6-terra'),
  OpenRouterModelTier: { STANDARD: 'standard' },
}));

const usage = (tokens: number) => ({
  choices: [],
  id: 'gen-1',
  usage: { completion_tokens: 0, prompt_tokens: 0, total_tokens: tokens },
});

describe('WorkflowGenerationService', () => {
  let service: WorkflowGenerationService;
  let llmDispatcherService: { completeStructured: ReturnType<typeof vi.fn> };

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
        type: 'videoGen',
      },
    ],
  };

  /**
   * The real helper reports each provider response through `onAttempt`; the
   * fake replays that so the token total stays under test.
   */
  function completeStructuredFake(tokensPerAttempt: number[]) {
    return async (params: {
      onAttempt?: (response: ReturnType<typeof usage>) => Promise<void> | void;
    }) => {
      for (const tokens of tokensPerAttempt) {
        await params.onAttempt?.(usage(tokens));
      }
      return validWorkflow;
    };
  }

  beforeEach(async () => {
    llmDispatcherService = {
      completeStructured: vi.fn(completeStructuredFake([500])),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowGenerationService,
        WorkflowFormatConverterService,
        { provide: LlmDispatcherService, useValue: llmDispatcherService },
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
    it('compiles generated presentation nodes into action-backed nodes', async () => {
      const result = await service.generateWorkflowFromDescription({
        description: 'Create a short video workflow',
      });
      expect(result.workflow).toEqual({
        ...validWorkflow,
        nodes: [
          {
            data: {
              config: { actionId: 'videoGen', parameters: {} },
              label: 'Input',
            },
            id: 'n1',
            position: { x: 0, y: 0 },
            type: 'genfeedAction',
          },
        ],
      });
    });

    it('asks the dispatcher for the workflow schema', async () => {
      await service.generateWorkflowFromDescription({
        description: 'A cool workflow',
      });

      expect(llmDispatcherService.completeStructured).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({
              content: 'A cool workflow',
              role: 'user',
            }),
          ]),
          schemaName: 'workflow_generation',
        }),
      );
    });

    it('returns the token count reported by the provider', async () => {
      const result = await service.generateWorkflowFromDescription({
        description: 'Generate some content',
      });
      expect(result.tokensUsed).toBe(500);
    });

    it('counts the repair turn as the second billed call', async () => {
      llmDispatcherService.completeStructured.mockImplementation(
        completeStructuredFake([500, 320]),
      );

      const result = await service.generateWorkflowFromDescription({
        description: 'Generate some content',
      });

      expect(result.tokensUsed).toBe(820);
    });

    it('includes platform constraint in system prompt when platforms provided', async () => {
      await service.generateWorkflowFromDescription({
        description: 'TikTok workflow',
        targetPlatforms: ['tiktok', 'instagram'],
      });
      const call = llmDispatcherService.completeStructured.mock.calls[0][0];
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
      const call = llmDispatcherService.completeStructured.mock.calls[0][0];
      const systemMsg = call.messages.find(
        (m: { role: string }) => m.role === 'system',
      );
      expect(systemMsg?.content).not.toContain('disabled_node');
    });

    it('stops instructing the model to return bare JSON', async () => {
      await service.generateWorkflowFromDescription({
        description: 'Any workflow',
      });
      const call = llmDispatcherService.completeStructured.mock.calls[0][0];
      const systemMsg = call.messages.find(
        (m: { role: string }) => m.role === 'system',
      );
      expect(systemMsg?.content).not.toContain('Return ONLY the JSON object');
    });

    it('surfaces the typed error when the model misses the schema twice', async () => {
      const error = new LlmStructuredOutputError('workflow_generation', [
        { code: 'too_small', message: 'expected >= 1', path: 'nodes' },
      ]);
      llmDispatcherService.completeStructured.mockRejectedValue(error);

      await expect(
        service.generateWorkflowFromDescription({ description: 'test' }),
      ).rejects.toBe(error);
    });

    it('throws UNPROCESSABLE_ENTITY when a node names an action we do not have', async () => {
      // The schema pins the graph's shape; it cannot know which action ids
      // the registry actually serves, so the converter is still a real gate.
      llmDispatcherService.completeStructured.mockResolvedValue({
        ...validWorkflow,
        nodes: [
          {
            data: { config: { actionId: 'not-a-real-action' }, label: 'X' },
            id: 'n1',
            position: { x: 0, y: 0 },
            type: 'genfeedAction',
          },
        ],
      });

      await expect(
        service.generateWorkflowFromDescription({ description: 'edge case' }),
      ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    });
  });
});
