import { enhanceCreatedPrompt } from '@api/collections/prompts/enhance-created-prompt';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { PromptStatus, Status } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const input = {
  brandId: 'selected-brand',
  chargedCredits: 1,
  contentType: 'image' as const,
  organizationId: 'org',
  promptId: 'prompt',
  requestedSkillSlugs: ['cinema'],
  systemPromptKey: 'system.model.image',
  url: 'prompt-create',
  userId: 'user',
  userPrompt: 'Raw input',
};

function setup(enhancement: { result: string } | Error) {
  const state = {
    enhanceRequests: [] as unknown[],
    prompts: new Map<string, Record<string, unknown>>([
      ['prompt', { status: PromptStatus.PROCESSING }],
    ]),
    refunds: [] as unknown[][],
    socketEvents: [] as Array<{ payload: unknown; path: string }>,
  };
  const deps = {
    creditsUtilsService: {
      refundOrganizationCredits: async (...args: unknown[]) => {
        state.refunds.push(args);
      },
    },
    loggerService: { error: () => {}, log: () => {} },
    promptEnhancementService: {
      enhance: async (request: unknown) => {
        state.enhanceRequests.push(request);
        if (enhancement instanceof Error) {
          throw enhancement;
        }
        return { isByok: false, result: enhancement.result, tokensUsed: 20 };
      },
    },
    promptsService: {
      patch: async (id: string, update: Record<string, unknown>) => {
        state.prompts.set(id, { ...state.prompts.get(id), ...update });
      },
    },
    websocketService: {
      emit: async (path: string, payload: unknown) => {
        state.socketEvents.push({ path, payload });
      },
    },
  };
  return { deps, state };
}

describe('enhanceCreatedPrompt', () => {
  it('persists and publishes the shared enhancer result for the selected brand and skills', async () => {
    const { deps, state } = setup({ result: 'Shared enhanced result' });

    await enhanceCreatedPrompt(
      deps as unknown as Parameters<typeof enhanceCreatedPrompt>[0],
      input,
    );

    expect(state.enhanceRequests).toEqual([
      {
        actorUserId: 'user',
        brandId: 'selected-brand',
        contentType: 'image',
        model: undefined,
        organizationId: 'org',
        requestedSkillSlugs: ['cinema'],
        systemPromptKey: 'system.model.image',
        userPrompt: 'Raw input',
      },
    ]);
    expect(state.prompts.get('prompt')).toEqual({
      enhanced: 'Shared enhanced result',
      status: PromptStatus.GENERATED,
    });
    expect(state.socketEvents).toEqual([
      {
        path: WebSocketPaths.prompt('prompt'),
        payload: { result: 'Shared enhanced result', status: Status.COMPLETED },
      },
    ]);
    expect(state.refunds).toEqual([]);
  });

  it('refunds, marks the prompt failed and reports the error when enhancement fails', async () => {
    const { deps, state } = setup(new Error('Enhancement unavailable'));

    await enhanceCreatedPrompt(
      deps as unknown as Parameters<typeof enhanceCreatedPrompt>[0],
      input,
    );

    expect(state.refunds).toEqual([
      [
        'org',
        1,
        'prompt-creation-refund',
        'Prompt creation failed - credit refund',
        expect.any(Date),
        { brandId: 'selected-brand' },
      ],
    ]);
    expect(state.prompts.get('prompt')).toEqual({
      status: PromptStatus.FAILED,
    });
    expect(state.socketEvents).toEqual([
      {
        path: WebSocketPaths.prompt('prompt'),
        payload: { error: 'Enhancement unavailable', status: Status.FAILED },
      },
    ]);
  });
});
