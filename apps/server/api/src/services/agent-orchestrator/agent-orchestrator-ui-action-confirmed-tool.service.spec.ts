import type { FinalizeStructuredAssistantTurnParams } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { AgentOrchestratorUiActionConfirmedToolService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-confirmed-tool.service';
import { AgentOrchestratorUiActionFinalizerService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-finalizer.service';
import type { AgentChatResult } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { AgentUiAction } from '@genfeedai/contracts/interfaces';

import { describe, expect, it, vi } from 'vitest';

async function finalizedResponse(
  value: FinalizeStructuredAssistantTurnParams,
): Promise<AgentChatResult> {
  return Object.freeze({
    threadId: value.threadId,
    creditsUsed: value.result.creditsUsed ?? 0,
    creditsRemaining: 100,
    toolCalls: value.toolCalls,
    message: Object.freeze({
      content: value.content,
      role: 'assistant' as const,
      metadata: Object.freeze({
        uiActions: Object.freeze(value.result.nextActions ?? []),
        model: value.model,
      }),
    }),
  });
}

describe('AgentOrchestratorUiActionConfirmedToolService', () => {
  it.each(['approved', 'declined'] as const)(
    'reloads one original generation card after %s finalization',
    async (decision) => {
      const root: AgentUiAction = {
        id: 'root',
        type: 'generation_action_card',
        title: 'Image',
        generationType: 'image',
        data: { decision },
      };
      const persistedActions: unknown[][] = [[root]];
      const addMessage = vi.fn(async (value) => {
        persistedActions.push(value.metadata.uiActions);
        Object.freeze(value.metadata.uiActions);
        Object.freeze(value.metadata);
      });
      const events = {
        recordAssistantFinalized: vi.fn(async (value) => {
          Object.freeze(value.metadata);
        }),
        recordRunCompleted: vi.fn(),
        recordToolStarted: vi.fn(),
        recordToolCompleted: vi.fn(),
      };
      const finalizer = new AgentOrchestratorUiActionFinalizerService(
        { addMessage } as never,
        {
          getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
        } as never,
        {
          buildAssistantUiActions: vi.fn(({ uiActions }) => ({
            uiActions,
            suggestedActions: [],
          })),
        } as never,
        events as never,
      );
      const finalize = vi.spyOn(finalizer, 'finalizeStructuredAssistantTurn');
      const service = new AgentOrchestratorUiActionConfirmedToolService(
        {
          executeTool: vi.fn().mockResolvedValue({
            success: true,
            creditsUsed: 1,
            nextActions: [
              { id: 'output', type: 'media_gallery', title: 'Image' },
            ],
          }),
        } as never,
        events as never,
        finalizer,
        {
          acquireLock: vi.fn().mockResolvedValue(true),
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn(),
          releaseLock: vi.fn(),
        } as never,
        {} as never,
        { transition: vi.fn().mockResolvedValue(root) } as never,
      );
      const response = await service.execute(
        decision === 'approved'
          ? 'confirm_generate_media'
          : 'decline_generate_media',
        {
          context: { organizationId: 'org', userId: 'user' },
          threadId: 'thread',
          model: 'chat',
          payload:
            decision === 'approved'
              ? {
                  sourceActionId: 'root',
                  generationType: 'image',
                  prompt: 'A coast',
                }
              : { sourceActionId: 'root' },
        },
      );
      expect(
        persistedActions
          .flat()
          .filter(
            (action) =>
              (action as AgentUiAction).type === 'generation_action_card',
          ),
      ).toEqual([root]);
      expect(addMessage).toHaveBeenCalledTimes(1);
      expect(finalize.mock.calls[0][0].result.nextActions ?? []).not.toContain(
        root,
      );
      expect(response.message.metadata.uiActions).toEqual([
        root,
        ...persistedActions[1],
      ]);
      expect(
        events.recordAssistantFinalized.mock.calls[0][0].metadata.uiActions,
      ).toEqual(persistedActions[1]);
      expect(response.message.metadata).not.toBe(
        events.recordAssistantFinalized.mock.calls[0][0].metadata,
      );
      expect(persistedActions[1]).toHaveLength(decision === 'approved' ? 1 : 0);
    },
  );
  it('reuses the decline transcript identity without executing tools or charging credits', async () => {
    const executeTool = vi.fn();
    const finalizeStructuredAssistantTurn = vi.fn(finalizedResponse);
    const service = new AgentOrchestratorUiActionConfirmedToolService(
      { executeTool } as never,
      {} as never,
      { finalizeStructuredAssistantTurn } as never,
      {} as never,
      {} as never,
      {
        transition: vi.fn().mockResolvedValue({
          id: 'root',
          type: 'generation_action_card',
          title: 'Image',
          data: { decision: 'declined' },
        }),
      } as never,
    );
    const params = {
      context: { organizationId: 'org', userId: 'user' },
      threadId: 'thread',
      model: 'chat',
      payload: { sourceActionId: 'root' },
    };
    const response = await service.execute('decline_generate_media', params);
    const replay = await service.execute('decline_generate_media', params);
    const first = finalizeStructuredAssistantTurn.mock.calls[0][0];
    const second = finalizeStructuredAssistantTurn.mock.calls[1][0];
    expect(first.messageId).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    expect(second.messageId).toBe(first.messageId);
    expect(first).toMatchObject({
      result: { creditsUsed: 0, success: true },
      toolCalls: [],
    });
    expect(executeTool).not.toHaveBeenCalled();
    expect(first.result.nextActions).toBeUndefined();
    expect(second.result.nextActions).toBeUndefined();
    const persisted =
      await finalizeStructuredAssistantTurn.mock.results[0].value;
    expect(persisted.message.metadata.uiActions).toEqual([]);
    expect(response.message.metadata.uiActions).toEqual([
      expect.objectContaining({ id: 'root', data: { decision: 'declined' } }),
    ]);
    expect(replay.message.metadata.uiActions).toEqual(
      response.message.metadata.uiActions,
    );
    expect(response.message.metadata).not.toBe(persisted.message.metadata);
  });
  it('replays an exact request while full duration and changed models have separate recovery identities', async () => {
    const executeTool = vi.fn().mockResolvedValue({
      success: true,
      creditsUsed: 10,
      nextActions: [{ id: 'output', type: 'media_gallery', title: 'Video' }],
    });
    const finalizeStructuredAssistantTurn = vi.fn(finalizedResponse);
    const cached = new Map<string, unknown>();
    const transition = vi.fn().mockResolvedValue({
      id: 'root',
      type: 'generation_action_card',
      title: 'Video',
      data: { decision: 'approved' },
    });
    const service = new AgentOrchestratorUiActionConfirmedToolService(
      { executeTool } as never,
      { recordToolStarted: vi.fn(), recordToolCompleted: vi.fn() } as never,
      { finalizeStructuredAssistantTurn } as never,
      {
        acquireLock: vi.fn().mockResolvedValue(true),
        releaseLock: vi.fn(),
        get: vi.fn(async (key: string) => cached.get(key) ?? null),
        set: vi.fn(async (key: string, value: unknown) => {
          cached.set(key, value);
        }),
      } as never,
      { execute: vi.fn() } as never,
      { transition } as never,
    );
    const request = {
      context: { organizationId: 'org', userId: 'user' },
      threadId: 'thread',
      model: 'chat',
      payload: {
        sourceActionId: 'root',
        generationType: 'video',
        model: 'video-model',
        duration: 5,
        prompt: 'A coast',
      },
    };
    const response = await service.execute('confirm_generate_media', request);
    const replay = await service.execute('confirm_generate_media', request);
    expect(response.message.metadata.uiActions).toEqual([
      expect.objectContaining({ id: 'root', data: { decision: 'approved' } }),
      expect.objectContaining({
        id: 'output',
        data: { sourceGenerationActionId: 'root' },
      }),
    ]);
    expect(replay.message.metadata.uiActions).toEqual(
      response.message.metadata.uiActions,
    );
    const persisted =
      await finalizeStructuredAssistantTurn.mock.results[0].value;
    expect(persisted.message.metadata.uiActions).toEqual([
      expect.objectContaining({ id: 'output' }),
    ]);
    expect(response.message.metadata).not.toBe(persisted.message.metadata);
    expect(executeTool).toHaveBeenCalledTimes(1);
    await service.execute('confirm_generate_media', {
      ...request,
      payload: { ...request.payload, duration: 10 },
    });
    await service.execute('confirm_generate_media', {
      ...request,
      payload: { ...request.payload, model: 'other-model' },
    });
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(
      new Set(executeTool.mock.calls.map((call) => call[2].sourceActionId))
        .size,
    ).toBe(3);
    for (const call of finalizeStructuredAssistantTurn.mock.calls)
      expect(call[0]).toMatchObject({
        result: {
          nextActions: [
            expect.objectContaining({
              data: { sourceGenerationActionId: 'root' },
            }),
          ],
        },
      });
    transition.mockRejectedValue(new Error('declined'));
    await expect(
      service.execute('confirm_generate_media', request),
    ).rejects.toThrow('declined');
    expect(executeTool).toHaveBeenCalledTimes(3);
  });
  it('uses trusted brand voice confirmation and rejects an unexecuted pending result', async () => {
    const executeTool = vi.fn().mockResolvedValue({
      success: true,
      requiresConfirmation: true,
      creditsUsed: 0,
    });
    const finalizeStructuredAssistantTurn = vi.fn();
    const service = new AgentOrchestratorUiActionConfirmedToolService(
      { executeTool } as never,
      { recordToolStarted: vi.fn(), recordToolCompleted: vi.fn() } as never,
      { finalizeStructuredAssistantTurn } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.execute('confirm_save_brand_voice_profile', {
        context: { organizationId: 'org', userId: 'user' },
        threadId: 'thread',
        model: 'chat',
        payload: { brandId: 'brand' },
      }),
    ).rejects.toThrow('Failed to save brand voice');
    expect(executeTool).toHaveBeenCalledWith(
      'save_brand_voice_profile',
      { brandId: 'brand' },
      expect.objectContaining({ confirmationOrigin: 'thread-ui-action' }),
    );
    expect(finalizeStructuredAssistantTurn).not.toHaveBeenCalled();
  });
  it('passes only image-supported parameters into the generate_image action', async () => {
    const executeTool = vi.fn().mockResolvedValue({
      creditsUsed: 0,
      nextActions: [],
      success: true,
    });
    const finalizeStructuredAssistantTurn = vi.fn(finalizedResponse);
    const service = new AgentOrchestratorUiActionConfirmedToolService(
      { executeTool } as never,
      {
        recordToolCompleted: vi.fn(),
        recordToolStarted: vi.fn(),
      } as never,
      { finalizeStructuredAssistantTurn } as never,
      {
        acquireLock: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue(null),
        releaseLock: vi.fn(),
        set: vi.fn(),
      } as never,
      { execute: vi.fn() } as never,
      {
        transition: vi.fn().mockResolvedValue({
          id: 'generation-action-1',
          type: 'generation_action_card',
          data: { decision: 'approved' },
        }),
      } as never,
    );

    await service.execute('confirm_generate_media', {
      context: {
        organizationId: 'organization-1',
        userId: 'user-1',
      },
      model: 'test/model',
      payload: {
        aspectRatio: '1:1',
        duration: 8,
        endFrame: 'end-frame-1',
        generationType: 'image',
        outputs: 1,
        prompt: 'A red apple on a white background',
        references: ['reference-1'],
        resolution: '1080p',
        sourceActionId: 'generation-action-1',
        videoReferences: ['video-1'],
      },
      threadId: 'thread-1',
    });

    expect(executeTool).toHaveBeenCalledWith(
      'generate_image',
      {
        aspectRatio: '1:1',
        outputs: 1,
        prompt: 'A red apple on a white background',
        references: ['reference-1'],
      },
      expect.objectContaining({
        // #4672: generate_image/generate_video are gated (approval-required)
        // in Manual mode — this explicit "Generate" click on the docked
        // review card IS the confirmation, so it must carry
        // `confirmationOrigin` or it would re-dock another card instead of
        // running the generation.
        confirmationOrigin: 'thread-ui-action',
        organizationId: 'organization-1',
        sourceActionId: expect.any(String),
        userId: 'user-1',
      }),
    );
  });

  it('passes the server-set confirmation origin into install_official_workflow (#4306)', async () => {
    const executeTool = vi.fn().mockResolvedValue({
      creditsUsed: 0,
      nextActions: [],
      success: true,
    });
    const finalizeStructuredAssistantTurn = vi
      .fn()
      .mockResolvedValue({ threadId: 'thread-1' });
    const service = new AgentOrchestratorUiActionConfirmedToolService(
      { executeTool } as never,
      {
        recordToolCompleted: vi.fn(),
        recordToolStarted: vi.fn(),
      } as never,
      { finalizeStructuredAssistantTurn } as never,
      {
        acquireLock: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue(null),
        releaseLock: vi.fn(),
        set: vi.fn(),
      } as never,
      { execute: vi.fn() } as never,
      { transition: vi.fn() } as never,
    );

    await service.execute('confirm_install_official_workflow', {
      context: {
        organizationId: 'organization-1',
        userId: 'user-1',
      },
      model: 'test/model',
      payload: {
        sourceActionId: 'install-action-1',
        workflowId: 'workflow-1',
      },
      threadId: 'thread-1',
    });

    expect(executeTool).toHaveBeenCalledWith(
      'install_official_workflow',
      expect.objectContaining({ workflowId: 'workflow-1' }),
      expect.objectContaining({
        confirmationOrigin: 'thread-ui-action',
        sourceActionId: 'install-action-1',
      }),
    );
  });
});
