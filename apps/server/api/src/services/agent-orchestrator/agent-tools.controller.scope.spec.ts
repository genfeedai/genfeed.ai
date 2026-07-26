import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { UsersService } from '@api/collections/users/services/users.service';
import { AgentToolsController } from '@api/services/agent-orchestrator/agent-tools.controller';
import type { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { ApiKeyScope } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';

const request = {} as Request;

const apiKeyUser = (scopes: string[]): User =>
  ({
    id: 'user-1',
    publicMetadata: {
      brand: 'brand-1',
      isApiKey: true,
      organization: 'org-1',
      scopes,
      user: 'user-1',
    },
  }) as User;

describe('AgentToolsController publishing scopes', () => {
  const executor = { executeTool: vi.fn() };
  const controller = new AgentToolsController(
    executor as unknown as AgentToolExecutorService,
    {} as UsersService,
    { error: vi.fn() } as unknown as LoggerService,
  );

  it('rejects confirmed direct publishing with only the legacy draft scope', async () => {
    await expect(
      controller.execute(
        'create_post',
        {
          parameters: {
            confirmed: true,
            contentId: 'content-1',
            platforms: ['linkedin'],
          },
        },
        apiKeyUser([ApiKeyScope.POSTS_CREATE]),
        request,
        'Bearer gf_test',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
        requiredScopes: [ApiKeyScope.POSTS_PUBLISH],
      }),
    });
    expect(executor.executeTool).not.toHaveBeenCalled();
  });

  it('rejects scheduled agent publishing without the schedule scope', async () => {
    await expect(
      controller.execute(
        'schedule_post',
        {
          parameters: {
            postId: 'post-1',
            scheduledAt: '2026-07-27T10:00:00.000Z',
          },
        },
        apiKeyUser([ApiKeyScope.POSTS_DRAFT]),
        request,
        'Bearer gf_test',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
        requiredScopes: [ApiKeyScope.POSTS_SCHEDULE],
      }),
    });
    expect(executor.executeTool).not.toHaveBeenCalled();
  });
});
