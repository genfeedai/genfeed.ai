import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AGENT_RUNTIME_ACTION_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import { AgentTurnWorkflowExecutionService } from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service';
import { RouterPriority } from '@genfeedai/contracts';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  );
}

describe('agent runtime workflow registration contract', () => {
  it('registers every agent action executor during module initialization', () => {
    const executionSource = source(
      './agent-turn-workflow-execution.service.ts',
    );

    expect(executionSource).toContain('implements OnModuleInit');
    for (const actionId of [
      'INPUT_RESPONSE',
      'TURN_FAIL',
      'TURN_FINALIZE',
      'TURN_INFER',
      'TURN_PREPARE',
      'UI_ACTION',
    ]) {
      expect(executionSource).toMatch(
        new RegExp(
          `registerAction\\(\\s*AGENT_RUNTIME_ACTION_IDS\\.${actionId}`,
        ),
      );
    }
  });

  it('constructs the execution service in the agent orchestrator module', () => {
    const moduleSource = source(
      '../../../../api/src/services/agent-orchestrator/agent-orchestrator.module.ts',
    );

    expect(moduleSource).toContain(
      "from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service'",
    );
    expect(moduleSource).toMatch(
      /providers:\s*\[[\s\S]*AgentTurnWorkflowExecutionService[\s\S]*\]/,
    );
  });

  it('returns the declared inference action envelope', async () => {
    const actions = new Map<string, (request: never) => unknown>();
    const service = Reflect.construct(AgentTurnWorkflowExecutionService, [
      ...Array.from({ length: 17 }, () => ({})),
      {
        registerAction: vi.fn(
          (actionId: string, executor: (request: never) => unknown) => {
            actions.set(actionId, executor);
          },
        ),
      },
    ]) as AgentTurnWorkflowExecutionService;
    const final = {
      artifactReferences: [],
      artifactVersionPinIds: [],
      content: 'Done',
      creditsUsed: 1,
      model: 'test/model',
      summary: 'Done',
      threadId: 'thread-1',
    };
    vi.spyOn(service, 'execute').mockResolvedValue(final);
    service.onModuleInit();

    const state = { threadId: 'thread-1' };
    const executor = actions.get(AGENT_RUNTIME_ACTION_IDS.TURN_INFER);
    expect(executor).toBeDefined();
    await expect(executor?.({ input: { state } } as never)).resolves.toEqual({
      decision: 'final',
      final,
      state,
      toolItems: [],
    });
  });

  it('executes explicit media through the shared UI-action workflow path without resolving or billing a chat round', async () => {
    const settingsService = { findOne: vi.fn() };
    const creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn(),
    };
    const contextService = { resolveSystemPromptAndModel: vi.fn() };
    const uiActionService = {
      handleThreadUiAction: vi.fn().mockResolvedValue({
        creditsRemaining: 90,
        creditsUsed: 10,
        message: {
          content: 'Image generation accepted.',
          metadata: { artifactReferences: [{ id: 'image-1' }] },
          role: 'assistant',
        },
        threadId: 'thread-1',
        toolCalls: [],
      }),
    };
    const dependencies = Array.from({ length: 18 }, () => ({}));
    dependencies[1] = settingsService;
    dependencies[4] = creditsUtilsService;
    dependencies[6] = contextService;
    dependencies[12] = uiActionService;
    dependencies[15] = { runExclusive: vi.fn() };
    const service = Reflect.construct(
      AgentTurnWorkflowExecutionService,
      dependencies,
    ) as AgentTurnWorkflowExecutionService;

    const result = await service.execute({
      executionId: 'execution-1',
      organizationId: 'organization-1',
      request: {
        content: 'Generate a red apple',
        expectedContextVersion: 4,
        generationMode: 'image',
        generationSettings: {
          aspectRatio: '1:1',
          model: 'black-forest-labs/flux-schnell',
          outputs: 1,
          prioritize: RouterPriority.SPEED,
        },
        threadId: 'thread-1',
      },
      threadId: 'thread-1',
      userId: 'user-1',
    });

    expect(uiActionService.handleThreadUiAction).toHaveBeenCalledWith(
      {
        action: 'confirm_generate_media',
        expectedContextVersion: 4,
        payload: {
          aspectRatio: '1:1',
          generationType: 'image',
          model: 'black-forest-labs/flux-schnell',
          outputs: 1,
          prioritize: 'speed',
          prompt: 'Generate a red apple',
          sourceActionId: 'composer-generation:execution-1',
        },
        threadId: 'thread-1',
      },
      expect.objectContaining({
        executionId: 'execution-1',
        organizationId: 'organization-1',
        userId: 'user-1',
      }),
      expect.objectContaining({ runInThreadLane: expect.any(Function) }),
    );
    expect(result).toMatchObject({
      content: 'Image generation accepted.',
      creditsUsed: 10,
      model: null,
      threadId: 'thread-1',
    });
    expect(settingsService.findOne).not.toHaveBeenCalled();
    expect(contextService.resolveSystemPromptAndModel).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('returns the declared failure action envelope', async () => {
    const actions = new Map<string, (request: never) => unknown>();
    const service = Reflect.construct(AgentTurnWorkflowExecutionService, [
      ...Array.from({ length: 17 }, () => ({})),
      {
        registerAction: vi.fn(
          (actionId: string, executor: (request: never) => unknown) => {
            actions.set(actionId, executor);
          },
        ),
      },
    ]) as AgentTurnWorkflowExecutionService;
    const recordFailure = vi
      .spyOn(service, 'recordFailure')
      .mockResolvedValue(undefined);
    service.onModuleInit();

    const executor = actions.get(AGENT_RUNTIME_ACTION_IDS.TURN_FAIL);
    expect(executor).toBeDefined();
    await expect(
      executor?.({
        context: { organizationId: 'organization-1', userId: 'user-1' },
        input: {
          failure: { error: 'Provider failed' },
          request: { threadId: 'thread-1' },
        },
        provenance: { executionId: 'execution-1' },
      } as never),
    ).resolves.toEqual({ error: 'Provider failed', threadId: 'thread-1' });
    expect(recordFailure).toHaveBeenCalledWith({
      error: 'Provider failed',
      executionId: 'execution-1',
      organizationId: 'organization-1',
      threadId: 'thread-1',
      userId: 'user-1',
    });
  });

  it('rejects a missing workflow failure error as a bad request', async () => {
    const actions = new Map<string, (request: never) => unknown>();
    const service = Reflect.construct(AgentTurnWorkflowExecutionService, [
      ...Array.from({ length: 17 }, () => ({})),
      {
        registerAction: vi.fn(
          (actionId: string, executor: (request: never) => unknown) => {
            actions.set(actionId, executor);
          },
        ),
      },
    ]) as AgentTurnWorkflowExecutionService;
    service.onModuleInit();

    const executor = actions.get(AGENT_RUNTIME_ACTION_IDS.TURN_FAIL);
    expect(executor).toBeDefined();
    const error = await Promise.resolve(
      executor?.({
        context: { organizationId: 'organization-1', userId: 'user-1' },
        input: { failure: {}, request: { threadId: 'thread-1' } },
        provenance: { executionId: 'execution-1' },
      } as never),
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BadRequestException);
    if (!(error instanceof BadRequestException)) {
      throw new TypeError('Expected BadRequestException');
    }
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.message).toBe('Agent workflow failure requires an error');
  });

  it('publishes one canonical terminal failure event path', async () => {
    const publishStreamFailureEffect = vi.fn(() => Effect.void);
    const recordRunFailed = vi.fn();
    const dependencies = Array.from({ length: 18 }, () => ({}));
    dependencies[13] = { publishStreamFailureEffect };
    dependencies[14] = { recordRunFailed };
    const service = Reflect.construct(
      AgentTurnWorkflowExecutionService,
      dependencies,
    ) as AgentTurnWorkflowExecutionService;

    await service.recordFailure({
      error: 'Provider failed',
      executionId: 'execution-1',
      organizationId: 'organization-1',
      threadId: 'thread-1',
      userId: 'user-1',
    });

    expect(recordRunFailed).not.toHaveBeenCalled();
    expect(publishStreamFailureEffect).toHaveBeenCalledOnce();
  });
});
