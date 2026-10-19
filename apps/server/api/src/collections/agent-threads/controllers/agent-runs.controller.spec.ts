import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentRunsController } from '@api/collections/agent-threads/controllers/agent-runs.controller';
import type { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data),
}));

describe('AgentRunsController', () => {
  const listAgentRuns = vi.fn();
  const user = {
    id: 'user_1',
    organizationId: 'org_1',
    userId: 'user_1',
  } as unknown as User;
  let controller: AgentRunsController;

  beforeEach(() => {
    listAgentRuns.mockReset();
    listAgentRuns.mockResolvedValue([]);
    controller = new AgentRunsController(
      { listAgentRuns } as unknown as AgentThreadsService,
      {} as unknown as UsersService,
      { error: vi.fn() } as unknown as LoggerService,
    );
  });

  it('defaults to 50 runs', async () => {
    await controller.listRuns({} as never, user);

    expect(listAgentRuns).toHaveBeenCalledWith(
      'user_1',
      'org_1',
      undefined,
      50,
    );
  });

  it('honours a limit up to the page-size cap and ignores junk', async () => {
    await controller.listRuns({} as never, user, 'brand_1', '10');
    await controller.listRuns({} as never, user, undefined, '5000');
    await controller.listRuns({} as never, user, undefined, 'abc');

    expect(listAgentRuns.mock.calls.map((call) => call[3])).toEqual([
      10, 100, 50,
    ]);
    expect(listAgentRuns.mock.calls[0]?.[2]).toBe('brand_1');
  });
});
