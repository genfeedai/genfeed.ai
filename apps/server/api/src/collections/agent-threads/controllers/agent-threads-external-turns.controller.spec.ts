import type { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import { AppendExternalAgentTurnDto } from '@api/collections/agent-threads/dto/append-external-agent-turn.dto';
import type { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { AgentScopeContextService } from '@api/index';
import { RATE_LIMIT_KEY } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { AGENT_EXTERNAL_RUNTIME_KEYS } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

vi.mock('@api/helpers/utils/error-response/error-response.util', () => ({
  ErrorResponse: {
    handle: vi.fn((error: unknown) => {
      throw error;
    }),
  },
}));

const user = {
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

const validBody = {
  assistantMessage: 'Done.',
  runtimeKey: AGENT_EXTERNAL_RUNTIME_KEYS.CODEX_CLI,
  sessionId: '0199a213-81c0-7800-8aa1-bbab2a035a53',
  toolCalls: [{ name: 'get_brand_context', status: 'completed' }],
  userMessage: 'Plan my week',
};

async function validationErrors(body: object): Promise<string[]> {
  const errors = await validate(
    plainToInstance(AppendExternalAgentTurnDto, body),
    { whitelist: true },
  );
  return errors.map((error) => error.property);
}

describe('AgentThreadsController external turns', () => {
  let appendExternalTurn: ReturnType<typeof vi.fn>;
  let controller: AgentThreadsController;

  beforeEach(() => {
    appendExternalTurn = vi.fn().mockResolvedValue({
      assistantMessage: { id: 'msg-2' },
      thread: {
        config: {
          externalRuntime: {
            runtimeKey: AGENT_EXTERNAL_RUNTIME_KEYS.CODEX_CLI,
            sessionId: validBody.sessionId,
            updatedAt: '2026-09-25T10:00:00.000Z',
          },
        },
        id: 'thread-1',
        organizationId: 'org-1',
        runtimeKey: AGENT_EXTERNAL_RUNTIME_KEYS.CODEX_CLI,
      },
      userMessage: { id: 'msg-1' },
    });

    controller = new AgentThreadsController(
      { appendExternalTurn } as unknown as AgentThreadsService,
      {} as AgentScopeContextService,
      {} as AgentMessagesService,
      {} as UsersService,
      { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
    );
  });

  it('is user rate limited', () => {
    expect(
      Reflect.getMetadata(
        RATE_LIMIT_KEY,
        AgentThreadsController.prototype.appendExternalTurn,
      ),
    ).toEqual({ limit: 30, scope: 'user', windowMs: 60_000 });
  });

  it('passes the authenticated organization and user to the service', async () => {
    await controller.appendExternalTurn(
      {} as never,
      'thread-1',
      validBody as AppendExternalAgentTurnDto,
      user,
    );

    expect(appendExternalTurn).toHaveBeenCalledWith(
      'thread-1',
      'org-1',
      'user-1',
      validBody,
    );
  });

  it('rejects callers without an organization context', async () => {
    await expect(
      controller.appendExternalTurn(
        {} as never,
        'thread-1',
        validBody as AppendExternalAgentTurnDto,
        { id: 'user-1', userId: 'user-1' } as never,
      ),
    ).rejects.toThrow(/organization/i);
    expect(appendExternalTurn).not.toHaveBeenCalled();
  });

  it('serializes the thread with the resumable CLI session', async () => {
    const response = (await controller.appendExternalTurn(
      {} as never,
      'thread-1',
      validBody as AppendExternalAgentTurnDto,
      user,
    )) as { data: { attributes: Record<string, unknown> } };

    expect(response.data.attributes.externalRuntime).toEqual({
      runtimeKey: AGENT_EXTERNAL_RUNTIME_KEYS.CODEX_CLI,
      sessionId: validBody.sessionId,
      updatedAt: '2026-09-25T10:00:00.000Z',
    });
    expect(response.data.attributes).not.toHaveProperty('config');
  });

  describe('AppendExternalAgentTurnDto', () => {
    it('accepts a well-formed external turn', async () => {
      expect(await validationErrors(validBody)).toEqual([]);
    });

    it('rejects hosted or unknown runtime keys', async () => {
      expect(
        await validationErrors({ ...validBody, runtimeKey: 'hosted/genfeed' }),
      ).toContain('runtimeKey');
    });

    it('rejects session ids that could smuggle CLI arguments', async () => {
      expect(
        await validationErrors({ ...validBody, sessionId: '--resume evil' }),
      ).toContain('sessionId');
    });

    it('requires a user message', async () => {
      expect(
        await validationErrors({ ...validBody, userMessage: '' }),
      ).toContain('userMessage');
    });

    it('validates nested tool call status', async () => {
      expect(
        await validationErrors({
          ...validBody,
          toolCalls: [{ name: 'x', status: 'running' }],
        }),
      ).toContain('toolCalls');
    });
  });
});
