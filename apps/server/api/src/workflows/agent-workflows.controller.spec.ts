import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { AgentWorkflowsController } from '@api/workflows/agent-workflows.controller';
import { AgentWorkflowsService } from '@api/workflows/agent-workflows.service';
import { testId } from '@helpers/testing/test-id.helper';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';

const organizationId = testId('org');
const userId = testId('user');

describe('AgentWorkflowsController', () => {
  let controller: AgentWorkflowsController;
  const service = {
    applyEvent: vi.fn(),
    createWorkflow: vi.fn(),
    getWorkflow: vi.fn(),
  };

  const user = {
    organizationId,
    userId,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentWorkflowsController],
      providers: [
        {
          provide: AgentWorkflowsService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AgentWorkflowsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates workflows with user and org metadata', async () => {
    service.createWorkflow.mockResolvedValue({ id: 'wf-1' });

    await controller.createWorkflow(
      { agentId: 'agent-1', linkedConversationId: 'thread-1' },
      user as never,
    );

    expect(service.createWorkflow).toHaveBeenCalledWith(
      userId,
      organizationId,
      { agentId: 'agent-1', linkedConversationId: 'thread-1' },
    );
  });

  it('wraps event responses in workflow payloads', async () => {
    service.applyEvent.mockResolvedValue({ currentPhase: 'clarifying' });
    const dto = { event: 'advance', questions: [] } as const;

    const result = await controller.applyEvent(
      'wf-1',
      dto as never,
      user as never,
    );

    expect(service.applyEvent).toHaveBeenCalledWith(
      'wf-1',
      organizationId,
      dto,
    );
    expect(result).toEqual({ workflow: { currentPhase: 'clarifying' } });
  });

  it('exposes exactly one PATCH route and no legacy transition routes', () => {
    const prototype = AgentWorkflowsController.prototype as unknown as Record<
      string,
      object
    >;
    const routes = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => prototype[name])
      .filter((handler) => Reflect.hasMetadata(PATH_METADATA, handler))
      .map((handler) => ({
        method: Reflect.getMetadata(METHOD_METADATA, handler),
        path: Reflect.getMetadata(PATH_METADATA, handler),
      }));

    expect(
      routes.filter((route) => route.method === RequestMethod.PATCH),
    ).toEqual([{ method: RequestMethod.PATCH, path: ':workflowId' }]);
    expect(
      routes.filter((route) =>
        [
          ':workflowId/approve',
          ':workflowId/force-advance',
          ':workflowId/rollback',
          ':workflowId/transition',
        ].includes(route.path),
      ),
    ).toEqual([]);
  });
});
