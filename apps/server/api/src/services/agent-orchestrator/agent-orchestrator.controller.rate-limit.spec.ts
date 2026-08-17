import { AgentOrchestratorController } from '@api/services/agent-orchestrator/agent-orchestrator.controller';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '@api/shared/guards/rate-limit/rate-limit.guard';
import { HttpException, HttpStatus } from '@nestjs/common';

const AGENT_TURN_RATE_LIMIT = {
  limit: 30,
  scope: 'user',
  windowMs: 60_000,
} as const satisfies RateLimitOptions;

const TURN_HANDLERS = [
  'createTurn',
  'createThreadTurn',
  'createTurnStream',
  'createThreadTurnStream',
] as const;

function createGuardContext(options: {
  currentCount: number;
  rateLimitOptions: RateLimitOptions;
  path?: string;
  userId?: string;
}) {
  const {
    currentCount,
    rateLimitOptions,
    path = '/agent/threads/turns',
    userId = 'user-turn-1',
  } = options;

  const mockSetHeader = vi.fn();
  const mockIncr = vi.fn().mockResolvedValue(currentCount);
  const mockExpire = vi.fn().mockResolvedValue(undefined);

  const reflector = {
    get: vi.fn().mockReturnValue(rateLimitOptions),
  };
  const cacheService = {
    expire: mockExpire,
    incr: mockIncr,
  };
  const context = {
    getHandler: vi.fn().mockReturnValue(() => {}),
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: () => ({
        connection: { remoteAddress: '127.0.0.1' },
        context: { userId },
        headers: {},
        ip: '127.0.0.1',
        method: 'POST',
        path,
        route: { path },
        user: { id: userId, userId },
      }),
      getResponse: () => ({ setHeader: mockSetHeader }),
    }),
  };

  const guard = new RateLimitGuard(reflector as never, cacheService as never);

  return { cacheService, context, guard, mockIncr, mockSetHeader };
}

describe('AgentOrchestratorController rate limits', () => {
  it.each(TURN_HANDLERS)(
    'applies a user-scoped 30/min turn limit on %s',
    (handler) => {
      const metadata = Reflect.getMetadata(
        RATE_LIMIT_KEY,
        AgentOrchestratorController.prototype[handler],
      ) as RateLimitOptions | undefined;

      expect(metadata).toEqual(AGENT_TURN_RATE_LIMIT);
    },
  );

  it('does not rate-limit read-only credit lookup', () => {
    const metadata = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      AgentOrchestratorController.prototype.getCredits,
    );

    expect(metadata).toBeUndefined();
  });

  it('returns 429 when the decorated turn limit is exceeded', async () => {
    const rateLimitOptions = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      AgentOrchestratorController.prototype.createTurn,
    ) as RateLimitOptions;

    expect(rateLimitOptions.limit).toBe(AGENT_TURN_RATE_LIMIT.limit);

    const { context, guard, mockSetHeader } = createGuardContext({
      currentCount: (rateLimitOptions.limit ?? 0) + 1,
      path: '/agent/threads/turns',
      rateLimitOptions,
    });

    try {
      await guard.canActivate(context as never);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect((error as HttpException).getResponse()).toEqual(
        expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
      );
    }

    expect(mockSetHeader).toHaveBeenCalledWith('Retry-After', 60);
  });

  it('keys the turn limit by user, not IP', async () => {
    const rateLimitOptions = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      AgentOrchestratorController.prototype.createTurnStream,
    ) as RateLimitOptions;
    const { context, guard, mockIncr } = createGuardContext({
      currentCount: 1,
      path: '/agent/threads/turns/stream',
      rateLimitOptions,
      userId: 'user-turn-42',
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);

    const key = mockIncr.mock.calls[0]?.[0] as string;
    expect(key).toContain('user-turn-42');
    expect(key).not.toContain('127.0.0.1');
  });
});
