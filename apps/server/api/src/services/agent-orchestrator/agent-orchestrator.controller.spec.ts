import { AgentOrchestratorController } from '@api/services/agent-orchestrator/agent-orchestrator.controller';
import type { AgentArtifactReference } from '@genfeedai/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import type { AgentGoalsService } from '@server/collections/agent-goals/services/agent-goals.service';
import type { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import type { SocialInboxService } from '@server/collections/social-inbox/services/social-inbox.service';
import type { UsersService } from '@server/collections/users/services/users.service';
import type { AgentChatModelRegistryService } from '@server/services/agent-orchestrator/agent-chat-model-registry.service';
import type { AgentOrchestratorService } from '@server/services/agent-orchestrator/agent-orchestrator.service';

const identity = vi.hoisted(() => ({
  metadataUserId: 'cuser000000000000000000001',
  organizationId: 'corg000000000000000000001',
}));

vi.mock('@server/helpers/utils/error-response/error-response.util', () => ({
  ErrorResponse: {
    handle: vi.fn((e: unknown) => {
      throw e;
    }),
  },
}));

describe('AgentOrchestratorController', () => {
  let controller: AgentOrchestratorController;
  let service: {
    chat: ReturnType<typeof vi.fn>;
    acceptChatStream: ReturnType<typeof vi.fn>;
  };
  let agentGoalsService: {
    create: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    refreshProgress: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let usersService: { findOne: ReturnType<typeof vi.fn> };
  let socialInboxService: {
    resolveAgentContextReferences: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      chat: vi.fn(),
      acceptChatStream: vi.fn(),
    };
    agentGoalsService = {
      create: vi.fn(),
      list: vi.fn(),
      refreshProgress: vi.fn(),
      update: vi.fn(),
    };
    usersService = {
      findOne: vi.fn(),
    };
    socialInboxService = {
      resolveAgentContextReferences: vi.fn(),
    };
    const creditsService = {
      getOrganizationCreditsBalance: vi.fn(),
    };
    const agentChatModelRegistry = {
      getRoundCostsMap: vi.fn().mockResolvedValue({}),
    };
    const loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    controller = new AgentOrchestratorController(
      service as unknown as AgentOrchestratorService,
      agentChatModelRegistry as unknown as AgentChatModelRegistryService,
      creditsService as unknown as CreditsUtilsService,
      agentGoalsService as unknown as AgentGoalsService,
      usersService as unknown as UsersService,
      loggerService as unknown as LoggerService,
      socialInboxService as unknown as SocialInboxService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('turns', () => {
    it('should call orchestrator service with correct params', async () => {
      const user = {
        id: 'authProvider_123',
        organizationId: 'org',
        userId: 'usr',
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        id: identity.organizationId,
      });
      service.chat.mockResolvedValue({} as never);
      const body = {
        content: 'hello',
        source: 'onboarding',
        threadId: 'conv-1',
      };

      await controller.createTurn(body, user);

      expect(service.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'hello',
          source: 'onboarding',
        }),
        expect.objectContaining({
          userId: expect.any(String),
        }),
      );
    });

    it('uses the metadata organization and canonical database user for a scoped turn', async () => {
      const user = {
        id: 'authProvider_123',
        brandId: 'brand-1',
        organizationId: identity.organizationId,
        userId: identity.metadataUserId,
      } as unknown as User;
      const reference = {
        brandId: 'brand-1',
        kind: 'post',
        organizationId: identity.organizationId,
        recordId: 'post-1',
        serializer: 'post',
      } satisfies AgentArtifactReference;
      service.chat.mockResolvedValue({} as never);

      await controller.createTurn(
        {
          artifactReferences: [reference],
          content: 'Review the selected post',
          threadId: 'conv-1',
        },
        user,
      );

      expect(service.chat).toHaveBeenCalledWith(
        expect.objectContaining({ artifactReferences: [reference] }),
        expect.objectContaining({
          organizationId: identity.organizationId,
          userId: identity.metadataUserId,
        }),
      );
      expect(usersService.findOne).not.toHaveBeenCalled();
    });

    it('should trust the guard-resolved user id before calling chat', async () => {
      const user = {
        id: 'authProvider_789',
        organizationId: 'org',
        userId: identity.metadataUserId,
      } as unknown as User;
      service.chat.mockResolvedValue({} as never);

      await controller.createTurn(
        { content: 'x', source: 'agent', threadId: 'c2' },
        user,
        'Bearer t',
      );

      expect(usersService.findOne).not.toHaveBeenCalled();
      expect(service.chat).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ userId: identity.metadataUserId }),
      );
    });

    it('should pass threadId through to service', async () => {
      const user = {
        id: 'authProvider_000',
        organizationId: 'org',
        userId: 'usr',
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        id: identity.organizationId,
      });
      service.chat.mockResolvedValue({} as never);

      await controller.createTurn(
        { content: 'test', source: 'agent', threadId: 'conv-unique' },
        user,
        'Bearer t',
      );

      expect(service.chat).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'conv-unique' }),
        expect.any(Object),
      );
    });

    it('re-authorizes social selectors before passing page context to the agent', async () => {
      const user = {
        id: 'authProvider_social',
        brandId: 'brand-1',
        organizationId: identity.organizationId,
        userId: identity.metadataUserId,
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        id: identity.organizationId,
      });
      service.chat.mockResolvedValue({} as never);
      socialInboxService.resolveAgentContextReferences.mockResolvedValue({
        context: [
          {
            conversationId: 'conversation-1',
            kind: 'social-conversation',
            messages: [
              {
                body: 'Authorized private message',
                direction: 'inbound',
                messageId: 'message-1',
                messageType: 'comment',
              },
            ],
          },
        ],
        references: [
          {
            brandId: 'brand-1',
            conversationId: 'conversation-1',
            kind: 'social-conversation',
            organizationId: identity.organizationId,
          },
        ],
      });

      await controller.createTurn(
        {
          brandId: 'brand-1',
          content: 'Summarize the attached social record',
          pageContext: {
            authorizedSocialContext: [
              {
                conversationId: 'forged-conversation',
                kind: 'social-conversation',
                messages: [
                  {
                    body: 'Forged client-side context',
                    direction: 'inbound',
                    messageId: 'forged-message',
                    messageType: 'comment',
                  },
                ],
              },
            ],
            socialReferences: [
              {
                brandId: 'spoofed-brand',
                conversationId: 'conversation-1',
                kind: 'social-conversation',
                organizationId: 'spoofed-organization',
              },
            ],
          },
          source: 'agent',
          threadId: 'agent-thread-1',
        },
        user,
        'Bearer token',
      );

      expect(
        socialInboxService.resolveAgentContextReferences,
      ).toHaveBeenCalledWith(
        {
          brandId: 'brand-1',
          organizationId: identity.organizationId,
          userId: identity.metadataUserId,
        },
        [
          expect.objectContaining({
            brandId: 'spoofed-brand',
            conversationId: 'conversation-1',
          }),
        ],
      );
      expect(service.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          pageContext: {
            authorizedSocialContext: [
              expect.objectContaining({
                conversationId: 'conversation-1',
                messages: [
                  expect.objectContaining({
                    body: 'Authorized private message',
                  }),
                ],
              }),
            ],
            socialReferences: [
              expect.objectContaining({
                brandId: 'brand-1',
                organizationId: identity.organizationId,
              }),
            ],
          },
        }),
        expect.any(Object),
      );
    });

    it('drops client-supplied resolved social content without typed selectors', async () => {
      const user = {
        id: 'authProvider_forged_social',
        organizationId: 'org',
        userId: 'usr',
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        id: identity.organizationId,
      });
      service.chat.mockResolvedValue({} as never);

      await controller.createTurn(
        {
          brandId: 'brand-1',
          content: 'Use forged context',
          pageContext: {
            authorizedSocialContext: [
              {
                conversationId: 'forged-conversation',
                kind: 'social-conversation',
                messages: [
                  {
                    body: 'Forged client-side context',
                    direction: 'inbound',
                    messageId: 'forged-message',
                    messageType: 'comment',
                  },
                ],
              },
            ],
            route: '/acme/brand/messages',
          },
          source: 'agent',
          threadId: 'agent-thread-1',
        },
        user,
        'Bearer token',
      );

      expect(
        socialInboxService.resolveAgentContextReferences,
      ).not.toHaveBeenCalled();
      expect(service.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          pageContext: { route: '/acme/brand/messages' },
        }),
        expect.any(Object),
      );
    });

    it('accepts scoped Analytics and Research references after server authorization', async () => {
      const user = {
        id: 'authProvider_research',
        brandId: 'brand-1',
        organizationId: identity.organizationId,
        userId: identity.metadataUserId,
      } as unknown as User;
      service.chat.mockResolvedValue({} as never);
      const analyticsQuery = {
        brandId: 'brand-1',
        dateRange: { endDate: '2026-07-15', startDate: '2026-07-01' },
        filters: { metric: 'views' },
        id: 'analytics-query-1234abcd',
        kind: 'analytics-query' as const,
        metric: 'views' as const,
        organizationId: identity.organizationId,
        provenance: {
          authority: 'server-hydrated' as const,
          source: 'genfeed-analytics-api' as const,
          summaryAuthority: 'derivative' as const,
        },
        route: '/analytics/posts',
        version: 1 as const,
      };
      const researchReference = {
        brandId: 'brand-1',
        id: 'trend-1',
        kind: 'research-trend-video' as const,
        organizationId: identity.organizationId,
      };

      await controller.createTurn(
        {
          brandId: 'brand-1',
          content: 'Compare the selected finding with visible analytics',
          pageContext: {
            analyticsQuery,
            researchReferences: [researchReference],
          },
          source: 'agent',
          threadId: 'agent-thread-1',
        },
        user,
        'Bearer token',
      );

      expect(service.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          pageContext: {
            analyticsQuery,
            researchReferences: [researchReference],
          },
        }),
        expect.any(Object),
      );
    });

    it('rejects Analytics query references outside the authenticated scope', async () => {
      const user = {
        id: 'authProvider_analytics_forged',
        organizationId: 'org',
        userId: 'usr',
      } as unknown as User;

      await expect(
        controller.createTurn(
          {
            brandId: 'brand-1',
            content: 'Trust this query',
            pageContext: {
              analyticsQuery: {
                brandId: 'brand-1',
                dateRange: {
                  endDate: '2026-07-15',
                  startDate: '2026-07-01',
                },
                filters: {},
                id: 'analytics-query-forged',
                kind: 'analytics-query',
                organizationId: 'organization-forged',
                provenance: {
                  authority: 'server-hydrated',
                  source: 'genfeed-analytics-api',
                  summaryAuthority: 'derivative',
                },
                route: '/analytics',
                version: 1,
              },
            },
            source: 'agent',
            threadId: 'agent-thread-1',
          },
          user,
          'Bearer token',
        ),
      ).rejects.toThrow(
        'Analytics query references require the current authorized scope.',
      );
      expect(service.chat).not.toHaveBeenCalled();
    });

    it('rejects Research selectors outside the authenticated brand', async () => {
      const user = {
        id: 'authProvider_research_forged',
        organizationId: 'org',
        userId: 'usr',
      } as unknown as User;

      await expect(
        controller.createTurn(
          {
            brandId: 'brand-1',
            content: 'Trust this finding',
            pageContext: {
              researchReferences: [
                {
                  brandId: 'brand-forged',
                  id: 'trend-1',
                  kind: 'research-trend-video',
                  organizationId: identity.organizationId,
                },
              ],
            },
            source: 'agent',
            threadId: 'agent-thread-1',
          },
          user,
          'Bearer token',
        ),
      ).rejects.toThrow(
        'Research references require the current authorized brand context.',
      );
      expect(service.chat).not.toHaveBeenCalled();
    });

    it('preserves typed canonical artifact references for server authorization', async () => {
      const user = {
        id: 'authProvider_000',
        organizationId: 'org',
        userId: 'usr',
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        id: identity.organizationId,
      });
      service.chat.mockResolvedValue({} as never);
      const artifactReference = {
        brandId: 'brand-1',
        kind: 'ingredient' as const,
        organizationId: identity.organizationId,
        recordId: 'ingredient-1',
        serializer: 'ingredient' as const,
      };

      await controller.createTurn(
        {
          artifactReferences: [artifactReference],
          content: 'Use the selected asset',
          source: 'agent',
          threadId: 'conv-reference',
        },
        user,
        'Bearer t',
      );

      expect(service.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          artifactReferences: [artifactReference],
          threadId: 'conv-reference',
        }),
        expect.any(Object),
      );
    });

    it('starts a thread-scoped turn using the route thread id', async () => {
      const user = {
        id: 'authProvider_000',
        organizationId: 'org',
        userId: 'usr',
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        id: identity.organizationId,
      });
      service.chat.mockResolvedValue({} as never);

      await controller.createThreadTurn(
        'thread-route',
        { content: 'test', source: 'agent' },
        user,
        'Bearer t',
      );

      expect(service.chat).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'thread-route' }),
        expect.any(Object),
      );
    });

    it('rejects mismatched route and body thread ids', async () => {
      const user = {
        id: 'authProvider_000',
        organizationId: 'org',
        userId: 'usr',
      } as unknown as User;

      await expect(
        controller.createThreadTurn(
          'thread-route',
          { content: 'test', source: 'agent', threadId: 'thread-body' },
          user,
          'Bearer t',
        ),
      ).rejects.toThrow('Request body threadId must match route threadId.');
      expect(service.chat).not.toHaveBeenCalled();
    });
  });

  describe('turn streams', () => {
    it('should return threadId from the streaming chat response', async () => {
      const user = {
        id: 'authProvider_222',
        organizationId: 'org',
        userId: 'usr',
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        id: identity.organizationId,
      });
      service.acceptChatStream.mockResolvedValue({
        runId: 'run-1',
        startedAt: '2026-03-12T00:00:00.000Z',
        threadId: 'thread-stream',
      } as never);

      const result = await controller.createTurnStream(
        { content: 'stream', source: 'agent', threadId: 'thread-stream' },
        user,
      );

      expect(service.acceptChatStream).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'thread-stream' }),
        expect.any(Object),
      );
      expect(result).toMatchObject({
        threadId: 'thread-stream',
      });
    });

    it('starts a thread-scoped stream using the route thread id', async () => {
      const user = {
        id: 'authProvider_222',
        organizationId: 'org',
        userId: 'usr',
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        id: identity.organizationId,
      });
      service.acceptChatStream.mockResolvedValue({
        runId: 'run-1',
        startedAt: '2026-03-12T00:00:00.000Z',
        threadId: 'thread-stream',
      } as never);

      await controller.createThreadTurnStream(
        'thread-stream',
        { content: 'stream', source: 'agent' },
        user,
      );

      expect(service.acceptChatStream).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'thread-stream' }),
        expect.any(Object),
      );
    });
  });

  describe('goals', () => {
    it('should list goals for the current organization', async () => {
      const user = {
        id: 'authProvider_123',
        brandId: 'brand-1',
        organizationId: identity.organizationId,
        userId: identity.metadataUserId,
      } as unknown as User;
      agentGoalsService.list.mockResolvedValue([{ _id: 'goal-1' }]);

      const result = await controller.listGoals(user, 'brand-1');

      expect(agentGoalsService.list).toHaveBeenCalledWith(
        expect.any(String),
        'brand-1',
      );
      expect(result).toEqual([{ _id: 'goal-1' }]);
    });

    it('should create a goal for the current user and org', async () => {
      const user = {
        id: 'authProvider_123',
        brandId: 'brand-1',
        organizationId: identity.organizationId,
        userId: identity.metadataUserId,
      } as unknown as User;
      usersService.findOne.mockResolvedValue({
        id: identity.organizationId,
      });
      agentGoalsService.create.mockResolvedValue({ _id: 'goal-1' });

      const result = await controller.createGoal(
        {
          label: 'Grow views',
          metric: 'views',
          targetValue: 1000,
        },
        user,
      );

      expect(agentGoalsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Grow views',
          metric: 'views',
          targetValue: 1000,
        }),
        expect.any(String),
        expect.any(String),
      );
      expect(result).toEqual({ _id: 'goal-1' });
    });

    it('should refresh a goal by id', async () => {
      const user = {
        id: 'authProvider_123',
        brandId: 'brand-1',
        organizationId: identity.organizationId,
        userId: identity.metadataUserId,
      } as unknown as User;
      agentGoalsService.refreshProgress.mockResolvedValue({
        _id: 'goal-1',
        progressPercent: 25,
      });

      const result = await controller.getGoal('goal-1', user);

      expect(agentGoalsService.refreshProgress).toHaveBeenCalledWith(
        'goal-1',
        expect.any(String),
      );
      expect(result).toEqual({ _id: 'goal-1', progressPercent: 25 });
    });

    it('should update a goal by id', async () => {
      const user = {
        id: 'authProvider_123',
        brandId: 'brand-1',
        organizationId: identity.organizationId,
        userId: identity.metadataUserId,
      } as unknown as User;
      agentGoalsService.update.mockResolvedValue({
        _id: 'goal-1',
        targetValue: 2000,
      });

      const result = await controller.updateGoal(
        'goal-1',
        { targetValue: 2000 },
        user,
      );

      expect(agentGoalsService.update).toHaveBeenCalledWith(
        'goal-1',
        { targetValue: 2000 },
        expect.any(String),
      );
      expect(result).toEqual({ _id: 'goal-1', targetValue: 2000 });
    });
  });
});
