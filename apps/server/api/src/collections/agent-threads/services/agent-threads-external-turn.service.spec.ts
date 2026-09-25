vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentMessageRole, AgentThreadStatus } from '@genfeedai/contracts';
import { AGENT_EXTERNAL_RUNTIME_KEYS } from '@genfeedai/contracts/constants';
import type { IAgentExternalTurnInput } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';

const baseInput: IAgentExternalTurnInput = {
  assistantMessage: 'Here is a launch post in your brand voice.',
  completedAt: '2026-09-25T10:00:05.000Z',
  model: 'claude-sonnet',
  runtimeKey: AGENT_EXTERNAL_RUNTIME_KEYS.CLAUDE_CLI,
  sessionId: '6f1c1d1e-7a4b-4c1b-9a8a-0d8a2c1f5e11',
  startedAt: '2026-09-25T10:00:00.000Z',
  toolCalls: [
    {
      argsSummary: '{"brandId":"brand-1"}',
      durationMs: 120,
      name: 'get_brand_context',
      resultSummary: 'Brand voice: playful',
      status: 'completed',
    },
  ],
  usage: { costUsd: 0.01, inputTokens: 1200, outputTokens: 300 },
  userMessage: 'Write a launch post',
};

describe('AgentThreadsService.appendExternalTurn', () => {
  let addMessage: ReturnType<typeof vi.fn>;
  let findFirst: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let prisma: Record<string, unknown>;
  let service: AgentThreadsService;

  beforeEach(() => {
    addMessage = vi
      .fn()
      .mockImplementation(async (dto: { role: AgentMessageRole }) => ({
        id: dto.role === AgentMessageRole.USER ? 'msg-user' : 'msg-assistant',
      }));
    findFirst = vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      config: { sessionIngredientIds: ['ing-1'] },
      id: 'thread-1',
      organizationId: 'org-1',
      status: AgentThreadStatus.ACTIVE,
      userId: 'user-1',
    });
    update = vi.fn().mockImplementation(async (args: { data: object }) => ({
      id: 'thread-1',
      ...args.data,
    }));
    prisma = {
      agentThread: { findFirst, update },
    };

    service = new AgentThreadsService(
      prisma as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      { addMessage } as unknown as AgentMessagesService,
    );
  });

  it('scopes the thread lookup to the organization, owner, and live rows', async () => {
    await service.appendExternalTurn('thread-1', 'org-1', 'user-1', baseInput);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'thread-1',
          isDeleted: false,
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'thread-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('rejects threads owned by another user or organization', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.appendExternalTurn('thread-1', 'org-2', 'user-2', baseInput),
    ).rejects.toThrow();
    expect(addMessage).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects archived threads', async () => {
    findFirst.mockResolvedValue({
      config: {},
      id: 'thread-1',
      organizationId: 'org-1',
      status: AgentThreadStatus.ARCHIVED,
      userId: 'user-1',
    });

    await expect(
      service.appendExternalTurn('thread-1', 'org-1', 'user-1', baseInput),
    ).rejects.toThrow(/archived/);
    expect(addMessage).not.toHaveBeenCalled();
  });

  it('writes the user and assistant messages with renderable tool calls', async () => {
    await service.appendExternalTurn('thread-1', 'org-1', 'user-1', baseInput);

    expect(addMessage).toHaveBeenCalledTimes(2);
    expect(addMessage.mock.calls[0]?.[0]).toMatchObject({
      brandId: 'brand-1',
      content: 'Write a launch post',
      organizationId: 'org-1',
      role: AgentMessageRole.USER,
      room: 'thread-1',
      userId: 'user-1',
    });
    expect(addMessage.mock.calls[1]?.[0]).toMatchObject({
      content: 'Here is a launch post in your brand voice.',
      metadata: {
        externalRuntime: {
          billing: 'user-subscription',
          runtimeKey: AGENT_EXTERNAL_RUNTIME_KEYS.CLAUDE_CLI,
          sessionId: baseInput.sessionId,
        },
        toolCalls: [
          {
            arguments: { summary: '{"brandId":"brand-1"}' },
            name: 'get_brand_context',
            resultSummary: 'Brand voice: playful',
            status: 'completed',
          },
        ],
      },
      role: AgentMessageRole.ASSISTANT,
      toolCalls: [
        {
          durationMs: 120,
          parameters: { summary: '{"brandId":"brand-1"}' },
          status: 'completed',
          toolName: 'get_brand_context',
        },
      ],
    });
  });

  it('stores the CLI session for resume without dropping other config', async () => {
    const result = await service.appendExternalTurn(
      'thread-1',
      'org-1',
      'user-1',
      baseInput,
    );

    expect(update.mock.calls[0]?.[0].data).toEqual({
      config: {
        externalRuntime: {
          runtimeKey: AGENT_EXTERNAL_RUNTIME_KEYS.CLAUDE_CLI,
          sessionId: baseInput.sessionId,
          updatedAt: baseInput.completedAt,
        },
        sessionIngredientIds: ['ing-1'],
      },
      runtimeKey: AGENT_EXTERNAL_RUNTIME_KEYS.CLAUDE_CLI,
    });
    expect(result.userMessage).toEqual({ id: 'msg-user' });
    expect(result.assistantMessage).toEqual({ id: 'msg-assistant' });
  });

  it('never touches credits or billing state', async () => {
    const touchedModels: string[] = [];
    const trackingPrisma = new Proxy(prisma, {
      get(target, property: string) {
        touchedModels.push(property);
        return target[property];
      },
    });
    const trackedService = new AgentThreadsService(
      trackingPrisma as unknown as PrismaService,
      { debug: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
      { addMessage } as unknown as AgentMessagesService,
    );

    await trackedService.appendExternalTurn(
      'thread-1',
      'org-1',
      'user-1',
      baseInput,
    );

    expect(
      touchedModels.filter((model) => /credit|billing|usage/i.test(model)),
    ).toEqual([]);
  });
});
