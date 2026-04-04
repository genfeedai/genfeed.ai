import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { AgentWorkflowsController } from '@api/workflows/agent-workflows.controller';
import { AgentWorkflowsService } from '@api/workflows/agent-workflows.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('AgentWorkflowsController', () => {
  let controller: AgentWorkflowsController;
  const service = {
    approve: vi.fn(),
    createWorkflow: vi.fn(),
    forceAdvance: vi.fn(),
    getWorkflow: vi.fn(),
    rollback: vi.fn(),
    transition: vi.fn(),
  };

  const user = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439011',
      user: '507f1f77bcf86cd799439012',
    },
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
      .overrideGuard(ClerkGuard)
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
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439011',
      { agentId: 'agent-1', linkedConversationId: 'thread-1' },
    );
  });

  it('wraps transition responses in workflow payloads', async () => {
    service.transition.mockResolvedValue({ currentPhase: 'clarifying' });

    const result = await controller.transition('wf-1', {}, user as never);

    expect(service.transition).toHaveBeenCalledWith(
      'wf-1',
      '507f1f77bcf86cd799439011',
      'agent',
      {},
    );
    expect(result).toEqual({ workflow: { currentPhase: 'clarifying' } });
  });
});
