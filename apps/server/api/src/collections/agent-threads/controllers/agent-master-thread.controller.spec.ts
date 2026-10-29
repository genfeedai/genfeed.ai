import { AgentMasterThreadController } from '@api/collections/agent-threads/controllers/agent-master-thread.controller';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import type { AgentMasterThreadService } from '@api/collections/agent-threads/services/agent-master-thread.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import { RATE_LIMIT_KEY } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { AgentThreadKind } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

const user = {
  brandId: 'brand_current',
  id: 'user_1',
  organizationId: 'org_current',
  userId: 'user_1',
};

describe('AgentMasterThreadController (#8526)', () => {
  const service = { getOrCreate: vi.fn() };
  const controller = new AgentMasterThreadController(
    service as unknown as AgentMasterThreadService,
    { findOne: vi.fn() } as unknown as UsersService,
    {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService,
  );

  it('serves a path that cannot be read as a thread id', () => {
    expect(Reflect.getMetadata('path', AgentMasterThreadController)).toBe(
      'agent/threads/master',
    );
    expect(Reflect.getMetadata('path', AgentThreadsController)).toBe(
      'agent/threads',
    );
  });

  it('rate limits per user because the first open writes', () => {
    expect(
      Reflect.getMetadata(
        RATE_LIMIT_KEY,
        AgentMasterThreadController.prototype.getMasterThread,
      ),
    ).toEqual({ limit: 30, scope: 'user', windowMs: 60_000 });
  });

  it('opens the master for the caller and their organization', async () => {
    service.getOrCreate.mockResolvedValue({
      id: 'master_1',
      kind: AgentThreadKind.MASTER,
      organizationId: user.organizationId,
      userId: user.userId,
    });

    await controller.getMasterThread({} as never, user);

    expect(service.getOrCreate).toHaveBeenCalledWith(
      user.userId,
      user.organizationId,
    );
  });
});
