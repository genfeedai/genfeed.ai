import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadTurnsController } from '@api/collections/agent-threads/controllers/agent-thread-turns.controller';
import type { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import type { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import { AgentThreadAccessLevel } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

vi.mock('@api/helpers/utils/error-response/error-response.util', () => ({
  ErrorResponse: {
    handle: vi.fn((error: unknown) => {
      throw error;
    }),
  },
}));

const user: AuthenticatedUser = {
  brandId: 'brand-1',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function buildController(accessLevel: AgentThreadAccessLevel) {
  return new AgentThreadTurnsController(
    {
      findOne: async () => ({ id: 'thread-1', status: 'active' }),
    } as unknown as AgentThreadsService,
    {
      assertAccess: async () => ({ accessLevel, canManageShares: false }),
    } as unknown as AgentThreadAccessService,
    {
      addMessage: async (input: { content: string; role: string }) => ({
        content: input.content,
        id: 'msg-1',
        role: input.role,
        room: 'thread-1',
      }),
    } as unknown as AgentMessagesService,
    {} as UsersService,
    { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
  );
}

async function postedRole(
  accessLevel: AgentThreadAccessLevel,
  role: string,
): Promise<unknown> {
  const response = (await buildController(accessLevel).addMessage(
    {} as never,
    'thread-1',
    { content: 'hello', role },
    user,
  )) as { data: { attributes: { role: unknown } } };
  return response.data.attributes.role;
}

describe('AgentThreadTurnsController addMessage role', () => {
  it('lets the thread owner post as the assistant', async () => {
    expect(await postedRole(AgentThreadAccessLevel.OWNER, 'assistant')).toBe(
      'assistant',
    );
  });

  it('writes a collaborator message as the user whatever role it asks for', async () => {
    expect(
      await postedRole(AgentThreadAccessLevel.COLLABORATE, 'assistant'),
    ).toBe('user');
  });
});
