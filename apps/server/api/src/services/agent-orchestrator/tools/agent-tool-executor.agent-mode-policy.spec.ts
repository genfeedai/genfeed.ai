import 'reflect-metadata';
import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';
import {
  AgentToolExecutorService,
  type ToolExecutionContext,
} from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentToolMutationAuthorizationService } from '@api/services/agent-orchestrator/tools/agent-tool-mutation-authorization.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #4672 confirmation matrix, exercised through the real
 * `AgentToolExecutorService.executeTool` → `applyMutationPolicy` path (not
 * just the pure `resolveEffectiveMutationPolicy` unit already covered in
 * `@genfeedai/actions`) — Manual confirms credit-spending, brand-context, and
 * outbound; Auto/Plan confirm only outbound; a confirmed "Generate" click
 * (`confirmationOrigin: 'thread-ui-action'`) bypasses the gate it itself
 * triggered.
 */
function createWorkflowRunner() {
  const executors = new Map<string, SystemWorkflowActionExecutor>();
  const workflows = new Set<string>();
  return {
    registerAction: vi.fn(
      (actionId: string, executor: SystemWorkflowActionExecutor) => {
        executors.set(actionId, executor);
      },
    ),
    registerWorkflow: vi.fn((definition: { canonicalId: string }) => {
      workflows.add(definition.canonicalId);
    }),
    runWorkflow: vi.fn(
      async (request: {
        actionType: string;
        canonicalId: string;
        inputValues?: Record<string, unknown>;
        organizationId: string;
        runtimeContext?: unknown;
        userId?: string;
      }) => {
        if (!workflows.has(request.canonicalId)) {
          throw new Error(`Missing test workflow ${request.canonicalId}`);
        }
        const executor = executors.get(request.actionType);
        if (!executor) {
          throw new Error(`Missing test action ${request.actionType}`);
        }
        const result = await executor({
          context: {
            organizationId: request.organizationId,
            runId: 'run-1',
            userId: request.userId ?? testId('user'),
            workflowId: 'workflow-1',
            workflowVersionId: 'workflow-version-1',
          },
          input:
            request.inputValues?.parameters &&
            typeof request.inputValues.parameters === 'object' &&
            !Array.isArray(request.inputValues.parameters)
              ? (request.inputValues.parameters as Record<string, unknown>)
              : {},
          provenance: {
            executionId: 'execution-1',
            workflowId: 'workflow-1',
            workflowLabel: request.canonicalId,
          },
          runtimeContext: request.runtimeContext,
        });
        return { provenance: { executionId: 'execution-1' }, result };
      },
    ),
  };
}

describe('AgentToolExecutorService — #4672 agent-mode confirmation matrix', () => {
  const logger = { error: vi.fn(), log: vi.fn() };
  const publishHandler = {
    createPost: vi.fn(),
    schedulePost: vi.fn(),
    handles: vi.fn(() => false),
    execute: vi.fn(),
  };
  const mediaGenerationHandler = { generateImage: vi.fn() };
  const brandContentHandler = { saveBrandVoiceProfile: vi.fn() };
  const prepareHandler = { prepareGeneration: vi.fn() };
  const instagramHandler = { handles: vi.fn(() => false), execute: vi.fn() };
  const xActionsHandler = { handles: vi.fn(() => false), execute: vi.fn() };

  let mcpApprovals: {
    attachResult: ReturnType<typeof vi.fn>;
    claimExecution: ReturnType<typeof vi.fn>;
    createPending: ReturnType<typeof vi.fn>;
    findActiveByIdempotencyKey: ReturnType<typeof vi.fn>;
    findOwned: ReturnType<typeof vi.fn>;
    resolve: ReturnType<typeof vi.fn>;
  };
  let agentThreadsService: { findOne: ReturnType<typeof vi.fn> };
  let service: AgentToolExecutorService;

  beforeEach(() => {
    vi.clearAllMocks();
    mcpApprovals = {
      attachResult: vi.fn(),
      claimExecution: vi.fn().mockResolvedValue(true),
      createPending: vi.fn().mockResolvedValue({
        id: 'apr-1',
        status: 'PENDING',
        toolName: 'save_brand_voice_profile',
      }),
      findActiveByIdempotencyKey: vi.fn().mockResolvedValue(null),
      findOwned: vi.fn(),
      resolve: vi.fn(),
    };
    agentThreadsService = { findOne: vi.fn() };
    const workflowRunner = createWorkflowRunner();
    const unused = {} as never;
    const mutationAuthorizationService =
      new AgentToolMutationAuthorizationService(
        logger as unknown as LoggerService,
        mcpApprovals as never,
        agentThreadsService as never,
      );
    service = new AgentToolExecutorService(
      logger as unknown as LoggerService,
      { scopeToolResultHrefs: vi.fn(async (result) => result) } as never,
      unused,
      unused,
      publishHandler as never,
      unused,
      unused,
      instagramHandler as never,
      xActionsHandler as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      mediaGenerationHandler as never,
      unused,
      brandContentHandler as never,
      prepareHandler as never,
      unused,
      unused,
      mutationAuthorizationService,
      { assertConsequentialBoundary: vi.fn() } as never,
      undefined,
      workflowRunner as never,
    );
    Object.assign(service, {
      workObjects: { assertReady: vi.fn().mockResolvedValue(undefined) },
    });
    service.onModuleInit();
  });

  const context = (
    overrides: Partial<ToolExecutionContext> = {},
  ): ToolExecutionContext => ({
    organizationId: testId('org'),
    userId: testId('user'),
    ...(overrides.threadId
      ? {
          validatedScope: {
            threadId: overrides.threadId,
            brandId: 'brand-1',
            contextVersion: 1,
          } as ToolExecutionContext['validatedScope'],
        }
      : {}),
    ...overrides,
  });

  describe('Manual — confirms credit-spending, brand-context, and outbound', () => {
    it('docks the generation review card for generate_image instead of generating', async () => {
      agentThreadsService.findOne.mockResolvedValue({ mode: 'manual' });
      prepareHandler.prepareGeneration.mockResolvedValue({
        creditsUsed: 0,
        data: { generationType: 'image', prompt: 'a red car' },
        nextActions: [{ id: 'gen-card-1', type: 'generation_action_card' }],
        success: true,
      });

      const result = await service.executeTool(
        'generate_image',
        { prompt: 'a red car' },
        context({ threadId: testId('thread') }),
      );

      expect(result.success).toBe(true);
      expect(result.nextActions?.[0]).toMatchObject({
        type: 'generation_action_card',
      });
      expect(prepareHandler.prepareGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          generationType: 'image',
          prompt: 'a red car',
        }),
        expect.anything(),
      );
      expect(mediaGenerationHandler.generateImage).not.toHaveBeenCalled();
    });

    it('a confirmed "Generate" click (confirmationOrigin) bypasses the gate it triggered', async () => {
      agentThreadsService.findOne.mockResolvedValue({ mode: 'manual' });
      mediaGenerationHandler.generateImage.mockResolvedValue({
        creditsUsed: 50,
        data: { id: 'img-1' },
        success: true,
      });

      const result = await service.executeTool(
        'generate_image',
        { prompt: 'a red car' },
        context({
          confirmationOrigin: 'thread-ui-action',
          threadId: testId('thread'),
        }),
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 'img-1' });
      expect(mediaGenerationHandler.generateImage).toHaveBeenCalledTimes(1);
      expect(prepareHandler.prepareGeneration).not.toHaveBeenCalled();
    });

    it('gates save_brand_voice_profile through the generic pending-approval path', async () => {
      agentThreadsService.findOne.mockResolvedValue({ mode: 'manual' });

      const result = await service.executeTool(
        'save_brand_voice_profile',
        { brandId: 'brand-1', voice: 'confident' },
        context({ hostSupportsApproval: true, threadId: testId('thread') }),
      );

      expect(result.success).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(mcpApprovals.createPending).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'save_brand_voice_profile',
        { brandId: 'brand-1', voice: 'confident' },
        expect.anything(),
      );
      expect(brandContentHandler.saveBrandVoiceProfile).not.toHaveBeenCalled();
    });

    it('still confirms outbound (schedule_post)', async () => {
      agentThreadsService.findOne.mockResolvedValue({ mode: 'manual' });

      const result = await service.executeTool(
        'schedule_post',
        { contentId: 'content-1' },
        context({ hostSupportsApproval: true, threadId: testId('thread') }),
      );

      expect(result.requiresConfirmation).toBe(true);
      expect(publishHandler.schedulePost).not.toHaveBeenCalled();
    });
  });

  describe('Auto — executes credit-spending and brand-context without confirmation, still confirms outbound', () => {
    it('generates the image directly with no review card', async () => {
      agentThreadsService.findOne.mockResolvedValue({ mode: 'auto' });
      mediaGenerationHandler.generateImage.mockResolvedValue({
        creditsUsed: 50,
        data: { id: 'img-2' },
        success: true,
      });

      const result = await service.executeTool(
        'generate_image',
        { prompt: 'a blue bike' },
        context({ threadId: testId('thread') }),
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 'img-2' });
      expect(mediaGenerationHandler.generateImage).toHaveBeenCalledTimes(1);
      expect(prepareHandler.prepareGeneration).not.toHaveBeenCalled();
    });

    it('saves the brand voice profile directly with no confirmation', async () => {
      agentThreadsService.findOne.mockResolvedValue({ mode: 'auto' });
      brandContentHandler.saveBrandVoiceProfile.mockResolvedValue({
        creditsUsed: 0,
        success: true,
      });

      const result = await service.executeTool(
        'save_brand_voice_profile',
        { brandId: 'brand-1', voice: 'confident' },
        context({ threadId: testId('thread') }),
      );

      expect(result.success).toBe(true);
      expect(brandContentHandler.saveBrandVoiceProfile).toHaveBeenCalledTimes(
        1,
      );
      expect(mcpApprovals.createPending).not.toHaveBeenCalled();
    });

    it('still confirms outbound (schedule_post)', async () => {
      agentThreadsService.findOne.mockResolvedValue({ mode: 'auto' });

      const result = await service.executeTool(
        'schedule_post',
        { contentId: 'content-1' },
        context({ hostSupportsApproval: true, threadId: testId('thread') }),
      );

      expect(result.requiresConfirmation).toBe(true);
      expect(publishHandler.schedulePost).not.toHaveBeenCalled();
    });
  });

  describe('Plan (running its approved steps) — behaves like Auto except outbound', () => {
    it('generates the image directly with no review card', async () => {
      agentThreadsService.findOne.mockResolvedValue({ mode: 'plan' });
      mediaGenerationHandler.generateImage.mockResolvedValue({
        creditsUsed: 50,
        data: { id: 'img-3' },
        success: true,
      });

      const result = await service.executeTool(
        'generate_image',
        { prompt: 'a green truck' },
        context({ threadId: testId('thread') }),
      );

      expect(result.success).toBe(true);
      expect(mediaGenerationHandler.generateImage).toHaveBeenCalledTimes(1);
    });

    it('still confirms outbound (schedule_post)', async () => {
      agentThreadsService.findOne.mockResolvedValue({ mode: 'plan' });

      const result = await service.executeTool(
        'schedule_post',
        { contentId: 'content-1' },
        context({ hostSupportsApproval: true, threadId: testId('thread') }),
      );

      expect(result.requiresConfirmation).toBe(true);
      expect(publishHandler.schedulePost).not.toHaveBeenCalled();
    });
  });

  describe('threadless execution (MCP, CLI, batch) — #4672 modes do not apply', () => {
    it('leaves generate_image direct without ever resolving a thread mode', async () => {
      mediaGenerationHandler.generateImage.mockResolvedValue({
        creditsUsed: 50,
        data: { id: 'img-4' },
        success: true,
      });

      const result = await service.executeTool(
        'generate_image',
        { prompt: 'a yellow scooter' },
        context(),
      );

      expect(result.success).toBe(true);
      expect(mediaGenerationHandler.generateImage).toHaveBeenCalledTimes(1);
      expect(agentThreadsService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('a thread whose mode could not be resolved fails safe to Manual', () => {
    it('docks the review card rather than generating when the thread lookup returns nothing', async () => {
      agentThreadsService.findOne.mockResolvedValue(null);
      prepareHandler.prepareGeneration.mockResolvedValue({
        creditsUsed: 0,
        nextActions: [{ id: 'gen-card-2', type: 'generation_action_card' }],
        success: true,
      });

      const result = await service.executeTool(
        'generate_image',
        { prompt: 'a purple hat' },
        context({ threadId: testId('thread') }),
      );

      expect(result.nextActions?.[0]).toMatchObject({
        type: 'generation_action_card',
      });
      expect(mediaGenerationHandler.generateImage).not.toHaveBeenCalled();
    });
  });
});
