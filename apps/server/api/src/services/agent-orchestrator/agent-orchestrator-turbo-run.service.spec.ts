import type { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentOrchestratorTurboRunService } from '@api/services/agent-orchestrator/agent-orchestrator-turbo-run.service';
import type { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import type { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type {
  TurboRunToolResult,
  TurboRunTurnParams,
} from '@api/services/agent-orchestrator/interfaces/agent-orchestrator-turbo-run.interface';
import type { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { beforeEach, describe, expect, it } from 'vitest';

type Recorded = Record<string, unknown>;

describe('AgentOrchestratorTurboRunService', () => {
  const card = {
    id: 'mutation-approval:apr-1',
    type: 'mutation_approval_card',
  };

  let toolResult: TurboRunToolResult;
  let toolRuns: Array<{ context: Recorded; params: Recorded; tool: string }>;
  let messages: Recorded[];
  let events: Array<{ kind: string; payload: Recorded }>;
  let streamErrors: string[];
  let service: AgentOrchestratorTurboRunService;

  const record = (kind: string) => async (payload: Recorded) => {
    events.push({ kind, payload });
  };

  beforeEach(() => {
    toolResult = {
      creditsUsed: 0,
      data: { status: 'pending' },
      nextActions: [card],
      requiresConfirmation: true,
      success: true,
    } as unknown as TurboRunToolResult;
    toolRuns = [];
    messages = [];
    events = [];
    streamErrors = [];

    service = new AgentOrchestratorTurboRunService(
      {
        addMessage: async (message: Recorded) => {
          messages.push(message);
          return message;
        },
      } as unknown as AgentMessagesService,
      {
        getOrganizationCreditsBalance: async () => 100,
      } as unknown as CreditsUtilsService,
      {
        executeTool: async (
          tool: string,
          params: Recorded,
          context: Recorded,
        ) => {
          toolRuns.push({ context, params, tool });
          return toolResult;
        },
      } as unknown as AgentToolExecutorService,
      {
        buildAssistantUiActions: (input: { uiActions: unknown[] }) => ({
          suggestedActions: [],
          uiActions: input.uiActions,
        }),
      } as unknown as AgentCompletionCardBuilderService,
      {
        recordAssistantFinalized: record('assistantFinalized'),
        recordRunCompleted: record('runCompleted'),
        recordToolCompleted: record('toolCompleted'),
        recordToolStarted: record('toolStarted'),
      } as unknown as AgentThreadEventRecorderService,
      {
        publishStreamDoneOnly: record('streamDone'),
        publishStreamErrorOnly: async (
          _context: unknown,
          _threadId: string,
          error: string,
        ) => {
          streamErrors.push(error);
        },
        publishStreamingToolCompleted: record('streamToolCompleted'),
        publishStreamingToolStarted: record('streamToolStarted'),
      } as unknown as AgentStreamEffectsService,
    );
  });

  function turn(
    context: Recorded,
    requestContent = 'Generate 3 posts for twitter about launch',
  ): TurboRunTurnParams {
    return {
      context: { organizationId: 'org-1', userId: 'user-1', ...context },
      model: 'test',
      policy: { brandId: 'brand-1' },
      requestContent,
      seedTitle: 'Turbo',
      startedAt: new Date().toISOString(),
      threadId: 'thread-1',
    } as unknown as TurboRunTurnParams;
  }

  const host = { maybeUpdateThreadTitle: async () => null };

  it.each([undefined, true])(
    'background user turns with approval capability %s return a pending card',
    async (hostSupportsApproval) => {
      await expect(
        service.tryHandleTurboRunTurnStream(
          turn({ executionMode: 'background', hostSupportsApproval }),
          host,
        ),
      ).resolves.toBe(true);

      expect(toolRuns).toEqual([
        {
          context: expect.objectContaining({ hostSupportsApproval: true }),
          params: expect.objectContaining({
            brandId: 'brand-1',
            count: 3,
            platforms: ['twitter'],
          }),
          tool: 'generate_turbo_content',
        },
      ]);
      expect(messages).toEqual([
        expect.objectContaining({
          content: 'Review the run details and approve to start generation.',
          metadata: expect.objectContaining({
            reviewRequired: true,
            uiActions: [card],
          }),
          room: 'thread-1',
        }),
      ]);
      expect(events.map(({ kind }) => kind)).toEqual([
        'toolStarted',
        'streamToolStarted',
        'toolCompleted',
        'streamToolCompleted',
        'assistantFinalized',
        'runCompleted',
        'streamDone',
      ]);
      expect(events.at(-2)?.payload).toMatchObject({
        detail: 'Waiting for your approval',
      });
      expect(events.at(-1)?.payload).toMatchObject({
        content: 'Review the run details and approve to start generation.',
        metadata: expect.objectContaining({ uiActions: [card] }),
      });
    },
  );

  it('rejects a background run when an explicitly unsupported host is refused by the gate', async () => {
    toolResult = {
      creditsUsed: 0,
      error: 'UNSUPPORTED_APPROVAL',
      success: false,
    } as unknown as TurboRunToolResult;

    await expect(
      service.tryHandleTurboRunTurnStream(
        turn({ executionMode: 'background', hostSupportsApproval: false }),
        host,
      ),
    ).rejects.toThrow('UNSUPPORTED_APPROVAL');

    expect(toolRuns[0]?.context).toMatchObject({ hostSupportsApproval: false });
    expect(messages).toEqual([]);
  });

  it('streams the failure to a live user instead of throwing', async () => {
    toolResult = {
      creditsUsed: 0,
      error: 'Not enough credits',
      success: false,
    } as unknown as TurboRunToolResult;

    await expect(
      service.tryHandleTurboRunTurnStream(turn({}), host),
    ).resolves.toBe(true);

    expect(streamErrors).toEqual(['Not enough credits']);
    expect(messages).toEqual([]);
    expect(
      events.find(({ kind }) => kind === 'toolCompleted')?.payload,
    ).toMatchObject({ error: 'Not enough credits', status: 'failed' });
  });

  it('persists the streamed transcript once a confirmed run completes', async () => {
    toolResult = {
      creditsUsed: 6,
      data: { message: 'Done', streamedTranscript: 'Drafted 3 posts.' },
      success: true,
    } as unknown as TurboRunToolResult;

    await service.tryHandleTurboRunTurnStream(turn({}), host);

    expect(messages).toEqual([
      expect.objectContaining({
        content: 'Drafted 3 posts.',
        metadata: expect.objectContaining({
          creditsRemaining: 100,
          reviewRequired: false,
          totalCreditsUsed: 6,
        }),
        toolCalls: [
          expect.objectContaining({
            creditsUsed: 6,
            result: { summary: 'Done' },
            status: 'completed',
          }),
        ],
      }),
    ]);
    expect(events.at(-2)?.payload).toMatchObject({ detail: 'Agent completed' });
  });

  it.each([
    ['a question', 'What should I post this week?', { brandId: 'brand-1' }],
    ['a run with no brand or handle', 'Generate 3 posts about launch', {}],
  ])('leaves %s alone', async (_label, requestContent, policy) => {
    const params = {
      ...turn({}, requestContent),
      policy,
    } as TurboRunTurnParams;

    await expect(
      service.tryHandleTurboRunTurnStream(params, host),
    ).resolves.toBe(false);
    expect(toolRuns).toEqual([]);
    expect(events).toEqual([]);
  });
});
