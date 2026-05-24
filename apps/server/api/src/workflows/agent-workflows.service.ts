import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  computeAgentWorkflowGateStatus,
  getNextAgentWorkflowPhase,
  isAgentWorkflowGateMetForPhase,
  isValidAgentWorkflowRollback,
} from '@api/workflows/agent-workflows.machine';
import type {
  AgentWorkflowActor,
  AgentWorkflowDocumentShape,
  AgentWorkflowPhase,
  AgentWorkflowPhaseHistoryEntry,
  AgentWorkflowTrigger,
} from '@api/workflows/agent-workflows.types';
import { CreateAgentWorkflowDto } from '@api/workflows/dto/create-agent-workflow.dto';
import { UpdateAgentWorkflowStateDto } from '@api/workflows/dto/update-agent-workflow-state.dto';
import type { AgentWorkflow } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

type WorkflowConfig = AgentWorkflowDocumentShape & {
  agentId: string;
  gateStatus: Record<AgentWorkflowPhase, boolean>;
  phaseHistory: Array<{
    from: AgentWorkflowPhase;
    to: AgentWorkflowPhase;
    trigger: AgentWorkflowTrigger;
    actor: AgentWorkflowActor;
    timestamp: string;
  }>;
  linkedConversationId: string | null;
};

type WorkflowApiState = {
  id: string;
  agentId: string;
  currentPhase: AgentWorkflowPhase;
  gateStatus: Record<AgentWorkflowPhase, boolean>;
  phaseHistory: Array<{
    from: AgentWorkflowPhase;
    to: AgentWorkflowPhase;
    trigger: AgentWorkflowTrigger;
    actor: AgentWorkflowActor;
    timestamp: string;
  }>;
  linkedConversationId: string | null;
  questions: AgentWorkflowDocumentShape['questions'];
  approaches: AgentWorkflowDocumentShape['approaches'];
  selectedApproachId: string | null;
  verificationEvidence: AgentWorkflowDocumentShape['verificationEvidence'];
  messages: AgentWorkflowDocumentShape['messages'];
  isLocked: boolean;
};

@Injectable()
export class AgentWorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async createWorkflow(
    userId: string,
    organizationId: string,
    dto: CreateAgentWorkflowDto,
  ): Promise<WorkflowApiState> {
    const initialState: AgentWorkflowDocumentShape = {
      approaches: [],
      currentPhase: 'exploring',
      isLocked: false,
      messages: [],
      questions: [],
      selectedApproachId: null,
      verificationEvidence: [],
    };

    const config: WorkflowConfig = {
      ...initialState,
      agentId: dto.agentId,
      gateStatus: computeAgentWorkflowGateStatus(initialState),
      linkedConversationId: dto.linkedConversationId ?? null,
      phaseHistory: [],
    };

    const workflow = await this.prisma.agentWorkflow.create({
      data: {
        config: config as never,
        organizationId,
        userId,
      },
    });

    return this.toApiState(workflow);
  }

  async getWorkflow(
    workflowId: string,
    organizationId: string,
  ): Promise<WorkflowApiState> {
    const workflow = await this.findWorkflow(workflowId, organizationId);
    return this.toApiState(workflow);
  }

  async transition(
    workflowId: string,
    organizationId: string,
    actor: AgentWorkflowActor,
    state?: UpdateAgentWorkflowStateDto,
  ): Promise<WorkflowApiState> {
    const workflow = await this.findWorkflow(workflowId, organizationId);
    const config = this.getConfig(workflow);
    this.applyStateUpdate(config, state);

    if (
      !isAgentWorkflowGateMetForPhase(config.currentPhase, {
        approaches: config.approaches,
        currentPhase: config.currentPhase,
        isLocked: config.isLocked,
        messages: config.messages,
        questions: config.questions,
        selectedApproachId: config.selectedApproachId,
        verificationEvidence: config.verificationEvidence,
      })
    ) {
      throw new BadRequestException(
        `Gate conditions not met for phase "${config.currentPhase}"`,
      );
    }

    const nextPhase = getNextAgentWorkflowPhase(config.currentPhase);

    if (!nextPhase) {
      throw new BadRequestException(
        'Workflow is already in its terminal phase',
      );
    }

    this.recordTransition(config, nextPhase, 'gate_met', actor, workflow.id);

    const updated = await this.prisma.agentWorkflow.update({
      data: { config: config as never },
      where: { id: workflow.id },
    });

    return this.toApiState(updated);
  }

  async approve(
    workflowId: string,
    organizationId: string,
    state?: UpdateAgentWorkflowStateDto,
  ): Promise<WorkflowApiState> {
    const workflow = await this.findWorkflow(workflowId, organizationId);
    const config = this.getConfig(workflow);
    this.applyStateUpdate(config, state);

    if (config.currentPhase !== 'awaiting_approval') {
      throw new BadRequestException(
        'Approval is only valid in the awaiting_approval phase',
      );
    }

    if (
      !isAgentWorkflowGateMetForPhase('awaiting_approval', {
        approaches: config.approaches,
        currentPhase: config.currentPhase,
        isLocked: config.isLocked,
        messages: config.messages,
        questions: config.questions,
        selectedApproachId: config.selectedApproachId,
        verificationEvidence: config.verificationEvidence,
      })
    ) {
      throw new BadRequestException('No approved approach selected');
    }

    this.recordTransition(
      config,
      'implementing',
      'gate_met',
      'user',
      workflow.id,
    );

    const updated = await this.prisma.agentWorkflow.update({
      data: { config: config as never },
      where: { id: workflow.id },
    });

    return this.toApiState(updated);
  }

  async rollback(
    workflowId: string,
    organizationId: string,
    targetPhase: AgentWorkflowPhase,
  ): Promise<WorkflowApiState> {
    const workflow = await this.findWorkflow(workflowId, organizationId);
    const config = this.getConfig(workflow);

    if (config.isLocked) {
      throw new BadRequestException('Workflow is locked');
    }

    if (!isValidAgentWorkflowRollback(config.currentPhase, targetPhase)) {
      throw new BadRequestException(
        `Invalid rollback from "${config.currentPhase}" to "${targetPhase}"`,
      );
    }

    this.recordTransition(config, targetPhase, 'rollback', 'user', workflow.id);

    const updated = await this.prisma.agentWorkflow.update({
      data: { config: config as never },
      where: { id: workflow.id },
    });

    return this.toApiState(updated);
  }

  async forceAdvance(
    workflowId: string,
    organizationId: string,
  ): Promise<WorkflowApiState> {
    const workflow = await this.findWorkflow(workflowId, organizationId);
    const config = this.getConfig(workflow);

    if (config.isLocked) {
      throw new BadRequestException('Workflow is locked');
    }

    const nextPhase = getNextAgentWorkflowPhase(config.currentPhase);

    if (!nextPhase) {
      throw new BadRequestException(
        'Workflow is already in its terminal phase',
      );
    }

    this.recordTransition(
      config,
      nextPhase,
      'force_advance',
      'user',
      workflow.id,
    );

    const updated = await this.prisma.agentWorkflow.update({
      data: { config: config as never },
      where: { id: workflow.id },
    });

    return this.toApiState(updated);
  }

  private getConfig(workflow: AgentWorkflow): WorkflowConfig {
    return (workflow.config ?? {}) as unknown as WorkflowConfig;
  }

  private applyStateUpdate(
    config: WorkflowConfig,
    state?: UpdateAgentWorkflowStateDto,
  ): void {
    if (state) {
      if (state.questions !== undefined) {
        config.questions = state.questions;
      }
      if (state.approaches !== undefined) {
        config.approaches = state.approaches;
      }
      if (state.selectedApproachId !== undefined) {
        config.selectedApproachId = state.selectedApproachId;
      }
      if (state.verificationEvidence !== undefined) {
        config.verificationEvidence = state.verificationEvidence;
      }
      if (state.messages !== undefined) {
        config.messages = state.messages;
      }
      if (state.isLocked !== undefined) {
        config.isLocked = state.isLocked;
      }
    }

    config.gateStatus = computeAgentWorkflowGateStatus({
      approaches: config.approaches,
      currentPhase: config.currentPhase,
      isLocked: config.isLocked,
      messages: config.messages,
      questions: config.questions,
      selectedApproachId: config.selectedApproachId,
      verificationEvidence: config.verificationEvidence,
    });
  }

  private async findWorkflow(
    workflowId: string,
    organizationId: string,
  ): Promise<AgentWorkflow> {
    const workflow = await this.prisma.agentWorkflow.findFirst({
      where: {
        id: workflowId,
        isDeleted: false,
        organizationId,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Agent workflow not found');
    }

    return workflow;
  }

  private recordTransition(
    config: WorkflowConfig,
    to: AgentWorkflowPhase,
    trigger: AgentWorkflowTrigger,
    actor: AgentWorkflowActor,
    workflowId: string,
  ): void {
    const from = config.currentPhase;

    config.phaseHistory = [
      ...(config.phaseHistory ?? []),
      {
        actor,
        from,
        timestamp: new Date().toISOString(),
        to,
        trigger,
      },
    ];
    config.currentPhase = to;
    config.gateStatus = computeAgentWorkflowGateStatus({
      approaches: config.approaches,
      currentPhase: config.currentPhase,
      isLocked: config.isLocked,
      messages: config.messages,
      questions: config.questions,
      selectedApproachId: config.selectedApproachId,
      verificationEvidence: config.verificationEvidence,
    });

    this.logger.debug('Agent workflow transition recorded', {
      actor,
      from,
      to,
      trigger,
      workflowId,
    });
  }

  private toApiState(workflow: AgentWorkflow): WorkflowApiState {
    const config = this.getConfig(workflow);
    return {
      agentId: config.agentId,
      approaches: config.approaches ?? [],
      currentPhase: config.currentPhase,
      gateStatus: config.gateStatus,
      id: workflow.id,
      isLocked: config.isLocked ?? false,
      linkedConversationId: config.linkedConversationId ?? null,
      messages: config.messages ?? [],
      phaseHistory: (config.phaseHistory ?? []).map((entry) => ({
        actor: entry.actor,
        from: entry.from,
        timestamp: entry.timestamp,
        to: entry.to,
        trigger: entry.trigger,
      })),
      questions: config.questions ?? [],
      selectedApproachId: config.selectedApproachId ?? null,
      verificationEvidence: config.verificationEvidence ?? [],
    };
  }
}
