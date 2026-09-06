import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { UsersService } from '@api/collections/users/services/users.service';
import { AgentToolsController } from '@api/services/agent-orchestrator/agent-tools.controller';
import type { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { ApiKeyScope } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';

const request = {} as Request;

const apiKeyUser = (scopes: string[]): User =>
  ({
    id: 'user-1',
    brandId: 'brand-1',
    isApiKey: true,
    organizationId: 'org-1',
    scopes,
    userId: 'user-1',
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
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
        requiredScopes: [ApiKeyScope.POSTS_PUBLISH],
      }),
    });
    expect(executor.executeTool).not.toHaveBeenCalled();
  });

  it.each([
    ['a numeric content reference', { confirmed: true, contentId: 42 }],
    ['no content reference', { confirmed: true }],
  ])(
    'fails closed for confirmed direct publishing with %s',
    async (_case, parameters) => {
      await expect(
        controller.execute(
          'create_post',
          { parameters },
          apiKeyUser([ApiKeyScope.POSTS_CREATE]),
          request,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
          requiredScopes: [ApiKeyScope.POSTS_PUBLISH],
        }),
      });
      expect(executor.executeTool).not.toHaveBeenCalled();
    },
  );

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
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
        requiredScopes: [ApiKeyScope.POSTS_SCHEDULE],
      }),
    });
    expect(executor.executeTool).not.toHaveBeenCalled();
  });

  it('strips a spoofed confirmation origin from direct tool execution', async () => {
    executor.executeTool.mockResolvedValue({
      creditsUsed: 0,
      success: true,
    });

    await controller.execute(
      'create_brand',
      {
        context: {
          confirmationOrigin: 'thread-ui-action',
        } as never,
        parameters: {
          confirmed: true,
          label: 'Spoofed Brand',
        },
      },
      apiKeyUser([]),
      request,
    );

    expect(executor.executeTool).toHaveBeenCalledWith(
      'create_brand',
      expect.objectContaining({ confirmed: true }),
      expect.not.objectContaining({
        confirmationOrigin: 'thread-ui-action',
      }),
    );
  });
  it('rejects client-injected reviewer authority for an ordinary user', async () => {
    await controller.execute(
      'create_post',
      {
        parameters: { content: 'draft' },
        context: {
          approvedApprovalId: 'apr-1',
          approvalReviewerAuthorized: true,
          hostSupportsApproval: true,
        } as never,
      },
      apiKeyUser([ApiKeyScope.POSTS_CREATE]),
      request,
    );
    expect(executor.executeTool).toHaveBeenLastCalledWith(
      'create_post',
      expect.anything(),
      expect.objectContaining({
        approvalReviewerAuthorized: false,
        approvedApprovalId: 'apr-1',
        userId: 'user-1',
        organizationId: 'org-1',
      }),
    );
  });

  it('derives legitimate reviewer authority from authenticated superadmin state', async () => {
    await controller.execute(
      'create_post',
      {
        parameters: { content: 'draft' },
        context: { approvedApprovalId: 'apr-1' },
      },
      { ...apiKeyUser([ApiKeyScope.POSTS_CREATE]), isSuperAdmin: true },
      request,
    );
    expect(executor.executeTool).toHaveBeenLastCalledWith(
      'create_post',
      expect.anything(),
      expect.objectContaining({
        approvalReviewerAuthorized: true,
        approvedApprovalId: 'apr-1',
      }),
    );
  });

  it('honors server request role revocation despite injected reviewer flags', async () => {
    await controller.execute(
      'create_post',
      {
        parameters: { content: 'draft' },
        context: {
          approvedApprovalId: 'apr-1',
          approvalReviewerAuthorized: true,
        } as never,
      },
      { ...apiKeyUser([ApiKeyScope.POSTS_CREATE]), isSuperAdmin: true },
      { context: { isSuperAdmin: false } } as unknown as Request,
    );
    expect(executor.executeTool).toHaveBeenLastCalledWith(
      'create_post',
      expect.anything(),
      expect.objectContaining({ approvalReviewerAuthorized: false }),
    );
  });
});
