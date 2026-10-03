import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { AgentScopeContextService } from '@api/index';
import { AgentToolsController } from '@api/services/agent-orchestrator/agent-tools.controller';
import { AgentUntrustedContentGateService } from '@api/services/agent-orchestrator/agent-untrusted-content-gate.service';
import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ApiKeyScope } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import httpRequest from 'supertest';

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
  const agentScopeContextService = { assertBrandAuthorized: vi.fn() };
  const controller = new AgentToolsController(
    executor as unknown as AgentToolExecutorService,
    {} as UsersService,
    { error: vi.fn() } as unknown as LoggerService,
    {
      evaluateToolResult: vi.fn(async ({ content }) => ({
        content,
        outcome: 'allowed',
      })),
    } as unknown as AgentUntrustedContentGateService,
    agentScopeContextService as unknown as AgentScopeContextService,
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
  it('strips a client-asserted validated scope from direct tool execution', async () => {
    await controller.execute(
      'create_brand',
      {
        context: {
          validatedScope: { brandId: 'brand-2', organizationId: 'org-1' },
        } as never,
        parameters: { confirmed: true, label: 'Brand' },
      },
      apiKeyUser([]),
      request,
    );
    expect(executor.executeTool).toHaveBeenLastCalledWith(
      'create_brand',
      expect.anything(),
      expect.not.objectContaining({ validatedScope: expect.anything() }),
    );
  });

  it('authorizes a client-requested brand against the organization before dispatch (#5855)', async () => {
    executor.executeTool.mockResolvedValue({ creditsUsed: 0, success: true });
    agentScopeContextService.assertBrandAuthorized.mockResolvedValueOnce(
      undefined,
    );
    await controller.execute(
      'list_brands',
      { context: { brandId: 'brand-1' }, parameters: {} },
      apiKeyUser([]),
      request,
    );
    expect(agentScopeContextService.assertBrandAuthorized).toHaveBeenCalledWith(
      'brand-1',
      'org-1',
    );
    expect(executor.executeTool.mock.calls.at(-1)?.[2]).toMatchObject({
      brandId: 'brand-1',
      organizationId: 'org-1',
    });
  });

  it('does not dispatch when the requested brand is outside the organization (#5855)', async () => {
    executor.executeTool.mockClear();
    agentScopeContextService.assertBrandAuthorized.mockRejectedValueOnce(
      new ForbiddenException('Requested brand is not available'),
    );
    await expect(
      controller.execute(
        'list_brands',
        { context: { brandId: 'foreign-brand' }, parameters: {} },
        apiKeyUser([]),
        request,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(executor.executeTool).not.toHaveBeenCalled();
  });

  it('never copies unlisted client context into the executor context even if validation is bypassed (#5898)', async () => {
    executor.executeTool.mockResolvedValue({ creditsUsed: 0, success: true });
    await controller.execute(
      'list_brands',
      {
        context: {
          agentMode: 'auto',
          creditGovernance: { agentDailyCreditCap: 1e9 },
          isWorkflowScoped: true,
          validatedScope: { organizationId: 'spoof-org' },
        } as never,
        parameters: {},
      },
      apiKeyUser([]),
      request,
    );
    const context = executor.executeTool.mock.calls.at(-1)?.[2];
    for (const field of [
      'agentMode',
      'creditGovernance',
      'isWorkflowScoped',
      'validatedScope',
    ]) {
      expect(context).not.toHaveProperty(field);
    }
    expect(context).toMatchObject({
      organizationId: 'org-1',
      userId: 'user-1',
    });
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

describe('AgentToolsController reported publication contract', () => {
  const parameters = {
    brandId: 'brand-1',
    platform: 'twitter',
    publicationKind: 'post',
    url: 'https://x.com/alice/status/123',
    description: '',
    publicationDate: '2026-01-01T00:00:00.000Z',
  };
  async function fixture() {
    const posts = {
      recordExternalPublication: vi.fn().mockResolvedValue({
        postId: 'recorded',
        created: true,
        source: 'extension',
        observedVisibility: 'unknown',
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        AgentPublishToolHandler,
        { provide: PostsService, useValue: posts },
        {
          provide: AgentScopeContextService,
          useValue: {
            assertBrandAuthorized: vi.fn().mockResolvedValue(undefined),
            assertResourceBrand: vi.fn(),
          },
        },
        { provide: PostGroupsService, useValue: { scheduleTarget: vi.fn() } },
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
          },
        },
      ],
    }).compile();
    const handler = module.get(AgentPublishToolHandler);
    const executor = {
      executeTool: vi.fn((_name, params, context) =>
        handler.recordExternalPublication(params, context),
      ),
    };
    const controller = new AgentToolsController(
      executor as unknown as AgentToolExecutorService,
      {} as UsersService,
      { error: vi.fn() } as unknown as LoggerService,
      {
        evaluateToolResult: vi.fn(async ({ content }) => ({
          content,
          outcome: 'allowed',
        })),
      } as unknown as AgentUntrustedContentGateService,
    );
    return { posts, executor, controller };
  }
  it('uses authenticated canonical identity through the controller and real recording handler', async () => {
    const f = await fixture();
    const result = await f.controller.execute(
      'record_external_publication',
      { parameters, context: { brandId: 'brand-1' } },
      apiKeyUser([ApiKeyScope.POSTS_DRAFT]),
      request,
    );
    expect(result).toMatchObject({
      success: true,
      creditsUsed: 0,
      data: { postId: 'recorded', observedVisibility: 'unknown' },
    });
    expect(f.posts.recordExternalPublication).toHaveBeenCalledWith(parameters, {
      organizationId: 'org-1',
      userId: 'user-1',
      brandId: 'brand-1',
    });
  });
  it('rejects a read-only API key before execution', async () => {
    const f = await fixture();
    await expect(
      f.controller.execute(
        'record_external_publication',
        { parameters, context: { brandId: 'brand-1' } },
        apiKeyUser([ApiKeyScope.ANALYTICS_READ]),
        request,
      ),
    ).rejects.toThrow();
    expect(f.executor.executeTool).not.toHaveBeenCalled();
    expect(f.posts.recordExternalPublication).not.toHaveBeenCalled();
  });
  it.each(['other', undefined])(
    'rejects missing or mismatched context brand %s',
    async (brandId) => {
      const f = await fixture();
      await expect(
        f.controller.execute(
          'record_external_publication',
          { parameters, context: { brandId } },
          apiKeyUser([ApiKeyScope.POSTS_DRAFT]),
          request,
        ),
      ).rejects.toThrow();
      expect(f.posts.recordExternalPublication).not.toHaveBeenCalled();
    },
  );
  it.each(['organizationId', 'userId', 'status'])(
    'rejects forged input %s',
    async (field) => {
      const f = await fixture();
      await expect(
        f.controller.execute(
          'record_external_publication',
          {
            parameters: { ...parameters, [field]: 'forged' },
            context: { brandId: 'brand-1' },
          },
          apiKeyUser([ApiKeyScope.POSTS_DRAFT]),
          request,
        ),
      ).rejects.toThrow();
      expect(f.posts.recordExternalPublication).not.toHaveBeenCalled();
    },
  );
});

describe('POST /agent-tools/record_external_publication/execute', () => {
  it('records and replays through the actual controller, handler and scoped persistence method', async () => {
    const rows: unknown[] = [];
    const post = {
      findMany: vi.fn(async () => rows),
      create: vi.fn(async ({ data }: Prisma.PostCreateArgs) => {
        const captured = { ...data, id: 'http-captured' };
        rows.push(captured);
        return captured;
      }),
    };
    const tx = {
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
      credential: { findMany: vi.fn().mockResolvedValue([]) },
      post,
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: vi.fn((callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
      post,
    };
    const executor = { executeTool: vi.fn() };
    const module = await Test.createTestingModule({
      controllers: [AgentToolsController],
      providers: [
        AgentPublishToolHandler,
        PostsService,
        {
          provide: AgentScopeContextService,
          useValue: {
            assertBrandAuthorized: vi.fn().mockResolvedValue(undefined),
            assertResourceBrand: vi.fn(),
          },
        },
        { provide: PrismaService, useValue: prisma },
        {
          provide: OnboardingCreditGrantsService,
          useValue: { completeMissions: vi.fn() },
        },
        { provide: PostGroupsService, useValue: { scheduleTarget: vi.fn() } },
        { provide: AgentToolExecutorService, useValue: executor },
        { provide: UsersService, useValue: {} },
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: AgentUntrustedContentGateService,
          useValue: {
            evaluateToolResult: vi.fn(async ({ content }) => ({
              content,
              outcome: 'allowed',
            })),
          },
        },
      ],
    }).compile();
    const handler = module.get(AgentPublishToolHandler);
    executor.executeTool.mockImplementation((_name, parameters, ctx) =>
      handler.recordExternalPublication(parameters, ctx),
    );
    const app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    const user = apiKeyUser([ApiKeyScope.POSTS_DRAFT]);
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.assign(req, { user });
      next();
    });
    await app.init();
    try {
      const body = {
        parameters: {
          brandId: 'brand-1',
          platform: 'twitter',
          publicationKind: 'post',
          url: 'https://x.com/alice/status/123',
          description: 'Reported publication',
          publicationDate: '2026-01-01T00:00:00.000Z',
        },
        context: { brandId: 'brand-1' },
      };
      // Client-asserted identity is rejected outright (#5898), not ignored.
      await httpRequest(app.getHttpServer())
        .post('/agent-tools/record_external_publication/execute')
        .send({
          ...body,
          context: {
            ...body.context,
            organizationId: 'forged-organization',
            userId: 'forged-user',
          },
        })
        .expect(400);
      expect(executor.executeTool).not.toHaveBeenCalled();
      const first = await httpRequest(app.getHttpServer())
        .post('/agent-tools/record_external_publication/execute')
        .send(body)
        .expect(201);
      expect(first.body).toMatchObject({
        success: true,
        creditsUsed: 0,
        data: {
          postId: 'http-captured',
          created: true,
          source: 'extension',
          observedVisibility: 'unknown',
        },
      });
      const replay = await httpRequest(app.getHttpServer())
        .post('/agent-tools/record_external_publication/execute')
        .send(body)
        .expect(201);
      expect(replay.body.data).toMatchObject({
        postId: 'http-captured',
        created: false,
      });
      expect(post.create).toHaveBeenCalledOnce();
      expect(post.create.mock.calls[0][0].data).toMatchObject({
        organizationId: 'org-1',
        userId: 'user-1',
        brandId: 'brand-1',
      });
      await httpRequest(app.getHttpServer())
        .post('/agent-tools/record_external_publication/execute')
        .send({
          ...body,
          parameters: { ...body.parameters, status: 'published' },
        })
        .expect(400);
      user.scopes = [ApiKeyScope.ANALYTICS_READ];
      await httpRequest(app.getHttpServer())
        .post('/agent-tools/record_external_publication/execute')
        .send(body)
        .expect(403);
      expect(post.create).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });
});
