import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentWorkflowsService } from '@api/workflows/agent-workflows.service';
import type {
  AgentWorkflowApproach,
  AgentWorkflowPhase,
  AgentWorkflowQuestion,
} from '@api/workflows/agent-workflows.types';
import type { PatchAgentWorkflowDto } from '@api/workflows/dto/patch-agent-workflow.dto';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

interface WorkflowRow {
  config: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  organizationId: string;
}

function approach(id: string): AgentWorkflowApproach {
  return {
    description: `Approach ${id}`,
    id,
    recommended: false,
    title: id,
    tradeoffs: { cons: [], pros: [] },
  };
}

describe('AgentWorkflowsService.applyEvent', () => {
  const organizationId = testId('organization');
  const workflowId = testId('workflow');
  let rows: WorkflowRow[];
  let service: AgentWorkflowsService;

  function seed(
    currentPhase: AgentWorkflowPhase,
    state: Record<string, unknown> = {},
  ): void {
    rows = [
      {
        config: {
          agentId: 'agent-1',
          approaches: [],
          currentPhase,
          isLocked: false,
          linkedConversationId: null,
          messages: [],
          phaseHistory: [],
          questions: [],
          selectedApproachId: null,
          verificationEvidence: [],
          ...state,
        },
        id: workflowId,
        isDeleted: false,
        organizationId,
      },
    ];
  }

  const storedPhase = () => rows[0]?.config.currentPhase;

  beforeEach(() => {
    rows = [];
    const matches = (row: WorkflowRow, where: Record<string, unknown>) =>
      Object.entries(where).every(
        ([key, value]) =>
          (row as unknown as Record<string, unknown>)[key] === value,
      );
    const agentWorkflow = {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = rows.find((candidate) => matches(candidate, where));
        // Hand back a copy, as the database would, so an in-memory edit
        // that is never written does not leak into the stored row.
        return row ? structuredClone(row) : null;
      },
      update: async ({
        data,
        where,
      }: {
        data: { config: Record<string, unknown> };
        where: Record<string, unknown>;
      }) => {
        const row = rows.find((candidate) => matches(candidate, where));
        if (!row) {
          throw new Error('Record to update not found');
        }
        row.config = structuredClone(data.config);
        return structuredClone(row);
      },
    };

    service = new AgentWorkflowsService(
      { agentWorkflow } as unknown as PrismaService,
      { debug: () => {} } as unknown as LoggerService,
    );
  });

  it('advances as the agent once the phase gate is met, saving the snapshot', async () => {
    const questions: AgentWorkflowQuestion[] = [
      {
        answer: 'Founders',
        id: 'q-1',
        text: 'Who is it for?',
        type: 'free_text',
      },
    ];
    seed('clarifying');

    const result = await service.applyEvent(workflowId, organizationId, {
      event: 'advance',
      questions,
    } as PatchAgentWorkflowDto);

    expect(result).toMatchObject({
      currentPhase: 'proposing',
      phaseHistory: [
        {
          actor: 'agent',
          from: 'clarifying',
          to: 'proposing',
          trigger: 'gate_met',
        },
      ],
      questions,
    });
    expect(storedPhase()).toBe('proposing');
  });

  it('refuses a normal advance while the gate is unmet', async () => {
    seed('clarifying', {
      questions: [{ id: 'q-1', text: 'Who is it for?', type: 'free_text' }],
    });

    await expect(
      service.applyEvent(workflowId, organizationId, { event: 'advance' }),
    ).rejects.toThrow('Gate conditions not met for phase "clarifying"');
    expect(storedPhase()).toBe('clarifying');
  });

  it('force-advances past an unmet gate without a state mutation', async () => {
    seed('clarifying');

    const result = await service.applyEvent(workflowId, organizationId, {
      event: 'advance',
      force: true,
    });

    expect(result.currentPhase).toBe('proposing');
    expect(result.phaseHistory).toEqual([
      expect.objectContaining({ actor: 'user', trigger: 'force_advance' }),
    ]);
    expect(result.questions).toEqual([]);
  });

  it('approves the selected approach from its state snapshot', async () => {
    seed('awaiting_approval', {
      approaches: [approach('a-1'), approach('a-2')],
    });

    const result = await service.applyEvent(workflowId, organizationId, {
      event: 'approve',
      selectedApproachId: 'a-2',
    } as PatchAgentWorkflowDto);

    expect(result).toMatchObject({
      currentPhase: 'implementing',
      selectedApproachId: 'a-2',
    });
    expect(storedPhase()).toBe('implementing');
  });

  it('refuses approval outside the awaiting_approval phase', async () => {
    seed('proposing');

    await expect(
      service.applyEvent(workflowId, organizationId, {
        event: 'approve',
        selectedApproachId: 'a-1',
      } as PatchAgentWorkflowDto),
    ).rejects.toThrow('Approval is only valid in the awaiting_approval phase');
    expect(storedPhase()).toBe('proposing');
  });

  it('rolls back to an earlier target phase', async () => {
    seed('implementing');

    const result = await service.applyEvent(workflowId, organizationId, {
      event: 'rollback',
      targetPhase: 'exploring',
    });

    expect(result.currentPhase).toBe('exploring');
    expect(result.phaseHistory).toEqual([
      expect.objectContaining({
        from: 'implementing',
        to: 'exploring',
        trigger: 'rollback',
      }),
    ]);
  });

  it('refuses a rollback to a later phase', async () => {
    seed('clarifying');

    await expect(
      service.applyEvent(workflowId, organizationId, {
        event: 'rollback',
        targetPhase: 'verifying',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storedPhase()).toBe('clarifying');
  });

  it('rejects an ambiguous payload before changing the workflow', async () => {
    seed('exploring');

    await expect(
      service.applyEvent(workflowId, organizationId, {
        event: 'advance',
        force: true,
        questions: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rows[0]?.config).toMatchObject({
      currentPhase: 'exploring',
      phaseHistory: [],
    });
  });

  it('does not find a workflow of another organization', async () => {
    seed('exploring');

    await expect(
      service.applyEvent(workflowId, testId('organization', 2), {
        event: 'advance',
        force: true,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(storedPhase()).toBe('exploring');
  });
});
