import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentWorkflowsService } from '@api/workflows/agent-workflows.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('AgentWorkflowsService', () => {
  let service: AgentWorkflowsService;
  let model: {
    create: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };

  const organizationId = '507f191e810c19729de860ee'.toHexString();
  const userId = '507f191e810c19729de860ee'.toHexString();

  beforeEach(async () => {
    model = {
      create: vi.fn(),
      findOne: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentWorkflowsService,
        { provide: PrismaService, useValue: model },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AgentWorkflowsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a workflow in exploring state', async () => {
    model.create.mockResolvedValue({
      _id: '507f191e810c19729de860ee',
      agentId: 'agent-1',
      approaches: [],
      currentPhase: 'exploring',
      gateStatus: {
        awaiting_approval: false,
        clarifying: false,
        complete: false,
        exploring: true,
        implementing: true,
        proposing: false,
        verifying: false,
      },
      isLocked: false,
      linkedConversationId: 'thread-1',
      messages: [],
      phaseHistory: [],
      questions: [],
      selectedApproachId: null,
      verificationEvidence: [],
    });

    const result = await service.createWorkflow(userId, organizationId, {
      agentId: 'agent-1',
      linkedConversationId: 'thread-1',
    });

    expect(result.currentPhase).toBe('exploring');
    expect(result.linkedConversationId).toBe('thread-1');
    expect(model.create).toHaveBeenCalled();
  });

  it('advances exploring to clarifying', async () => {
    const workflow = createWorkflowDoc({
      currentPhase: 'exploring',
    });
    model.findOne.mockResolvedValue(workflow);

    const result = await service.transition(
      workflow._id.toString(),
      organizationId,
      'agent',
    );

    expect(result.currentPhase).toBe('clarifying');
    expect(workflow.save).toHaveBeenCalled();
  });

  it('rejects transition when clarifying questions are unanswered', async () => {
    const workflow = createWorkflowDoc({
      currentPhase: 'clarifying',
      questions: [{ id: 'q1', text: 'Question?', type: 'free_text' }],
    });
    model.findOne.mockResolvedValue(workflow);

    await expect(
      service.transition(workflow._id.toString(), organizationId, 'agent'),
    ).rejects.toThrow(BadRequestException);
  });

  it('approves awaiting_approval into implementing', async () => {
    const workflow = createWorkflowDoc({
      approaches: [
        {
          description: 'A',
          id: 'a1',
          recommended: true,
          title: 'Approach A',
          tradeoffs: { cons: [], pros: [] },
        },
        {
          description: 'B',
          id: 'a2',
          recommended: false,
          title: 'Approach B',
          tradeoffs: { cons: [], pros: [] },
        },
      ],
      currentPhase: 'awaiting_approval',
      selectedApproachId: 'a1',
    });
    model.findOne.mockResolvedValue(workflow);

    const result = await service.approve(
      workflow._id.toString(),
      organizationId,
    );

    expect(result.currentPhase).toBe('implementing');
    expect(workflow.save).toHaveBeenCalled();
  });

  it('rolls back to an earlier phase', async () => {
    const workflow = createWorkflowDoc({
      currentPhase: 'verifying',
    });
    model.findOne.mockResolvedValue(workflow);

    const result = await service.rollback(
      workflow._id.toString(),
      organizationId,
      'clarifying',
    );

    expect(result.currentPhase).toBe('clarifying');
  });

  it('force-advances regardless of unmet gate', async () => {
    const workflow = createWorkflowDoc({
      currentPhase: 'proposing',
    });
    model.findOne.mockResolvedValue(workflow);

    const result = await service.forceAdvance(
      workflow._id.toString(),
      organizationId,
    );

    expect(result.currentPhase).toBe('awaiting_approval');
  });

  it('throws when workflow does not exist', async () => {
    model.findOne.mockResolvedValue(null);

    await expect(
      service.getWorkflow(
        '507f191e810c19729de860ee'.toHexString(),
        organizationId,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

function createWorkflowDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f191e810c19729de860ee',
    agentId: 'agent-1',
    approaches: [],
    currentPhase: 'exploring',
    gateStatus: {
      awaiting_approval: false,
      clarifying: false,
      complete: false,
      exploring: true,
      implementing: true,
      proposing: false,
      verifying: false,
    },
    isLocked: false,
    linkedConversationId: null,
    messages: [],
    phaseHistory: [],
    questions: [],
    save: vi.fn().mockResolvedValue(undefined),
    selectedApproachId: null,
    verificationEvidence: [],
    ...overrides,
  };
}
