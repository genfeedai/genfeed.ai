import { DB_CONNECTIONS } from '@api/constants/database.constants';
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
  AgentWorkflowTrigger,
} from '@api/workflows/agent-workflows.types';
import { CreateAgentWorkflowDto } from '@api/workflows/dto/create-agent-workflow.dto';
import { UpdateAgentWorkflowStateDto } from '@api/workflows/dto/update-agent-workflow-state.dto';
import {
  AgentWorkflow,
  type AgentWorkflowDocument,
} from '@api/workflows/schemas/agent-workflow.schema';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';

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
  questions: AgentWorkflowDocument['questions'];
  approaches: AgentWorkflowDocument['approaches'];
  selectedApproachId: string | null;
  verificationEvidence: AgentWorkflowDocument['verificationEvidence'];
  messages: AgentWorkflowDocument['messages'];
  isLocked: boolean;
};

@Injectable()
export class AgentWorkflowsService {
  constructor(
    @InjectModel(AgentWorkflow.name, DB_CONNECTIONS.AGENT)
    private readonly model: Model<AgentWorkflowDocument>,
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

    const workflow = await this.model.create({
      ...initialState,
      agentId: dto.agentId,
      gateStatus: computeAgentWorkflowGateStatus(initialState),
      linkedConversationId: dto.linkedConversationId ?? null,
      organization: new Types.ObjectId(organizationId),
      phaseHistory: [],
      user: new Types.ObjectId(userId),
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
    this.applyStateUpdate(workflow, state);

    if (
      !isAgentWorkflowGateMetForPhase(workflow.currentPhase, {
        approaches: workflow.approaches,
        currentPhase: workflow.currentPhase,
        isLocked: workflow.isLocked,
        messages: workflow.messages,
        questions: workflow.questions,
        selectedApproachId: workflow.selectedApproachId,
        verificationEvidence: workflow.verificationEvidence,
      })
    ) {
      throw new BadRequestException(
        `Gate conditions not met for phase "${workflow.currentPhase}"`,
      );
    }

    const nextPhase = getNextAgentWorkflowPhase(workflow.currentPhase);

    if (!nextPhase) {
      throw new BadRequestException(
        'Workflow is already in its terminal phase',
      );
    }

    this.recordTransition(workflow, nextPhase, 'gate_met', actor);
    await workflow.save();

    return this.toApiState(workflow);
  }

  async approve(
    workflowId: string,
    organizationId: string,
    state?: UpdateAgentWorkflowStateDto,
  ): Promise<WorkflowApiState> {
    const workflow = await this.findWorkflow(workflowId, organizationId);
    this.applyStateUpdate(workflow, state);

    if (workflow.currentPhase !== 'awaiting_approval') {
      throw new BadRequestException(
        'Approval is only valid in the awaiting_approval phase',
      );
    }

    if (
      !isAgentWorkflowGateMetForPhase('awaiting_approval', {
        approaches: workflow.approaches,
        currentPhase: workflow.currentPhase,
        isLocked: workflow.isLocked,
        messages: workflow.messages,
        questions: workflow.questions,
        selectedApproachId: workflow.selectedApproachId,
        verificationEvidence: workflow.verificationEvidence,
      })
    ) {
      throw new BadRequestException('No approved approach selected');
    }

    this.recordTransition(workflow, 'implementing', 'gate_met', 'user');
    await workflow.save();

    return this.toApiState(workflow);
  }

  async rollback(
    workflowId: string,
    organizationId: string,
    targetPhase: AgentWorkflowPhase,
  ): Promise<WorkflowApiState> {
    const workflow = await this.findWorkflow(workflowId, organizationId);

    if (workflow.isLocked) {
      throw new BadRequestException('Workflow is locked');
    }

    if (!isValidAgentWorkflowRollback(workflow.currentPhase, targetPhase)) {
      throw new BadRequestException(
        `Invalid rollback from "${workflow.currentPhase}" to "${targetPhase}"`,
      );
    }

    this.recordTransition(workflow, targetPhase, 'rollback', 'user');
    await workflow.save();

    return this.toApiState(workflow);
  }

  async forceAdvance(
    workflowId: string,
    organizationId: string,
  ): Promise<WorkflowApiState> {
    const workflow = await this.findWorkflow(workflowId, organizationId);

    if (workflow.isLocked) {
      throw new BadRequestException('Workflow is locked');
    }

    const nextPhase = getNextAgentWorkflowPhase(workflow.currentPhase);

    if (!nextPhase) {
      throw new BadRequestException(
        'Workflow is already in its terminal phase',
      );
    }

    this.recordTransition(workflow, nextPhase, 'force_advance', 'user');
    await workflow.save();

    return this.toApiState(workflow);
  }

  private applyStateUpdate(
    workflow: AgentWorkflowDocument,
    state?: UpdateAgentWorkflowStateDto,
  ): void {
    if (state) {
      if (state.questions !== undefined) {
        workflow.questions = state.questions;
      }
      if (state.approaches !== undefined) {
        workflow.approaches = state.approaches;
      }
      if (state.selectedApproachId !== undefined) {
        workflow.selectedApproachId = state.selectedApproachId;
      }
      if (state.verificationEvidence !== undefined) {
        workflow.verificationEvidence = state.verificationEvidence;
      }
      if (state.messages !== undefined) {
        workflow.messages = state.messages;
      }
      if (state.isLocked !== undefined) {
        workflow.isLocked = state.isLocked;
      }
    }

    workflow.gateStatus = computeAgentWorkflowGateStatus({
      approaches: workflow.approaches,
      currentPhase: workflow.currentPhase,
      isLocked: workflow.isLocked,
      messages: workflow.messages,
      questions: workflow.questions,
      selectedApproachId: workflow.selectedApproachId,
      verificationEvidence: workflow.verificationEvidence,
    });
  }

  private async findWorkflow(
    workflowId: string,
    organizationId: string,
  ): Promise<AgentWorkflowDocument> {
    if (!Types.ObjectId.isValid(workflowId)) {
      throw new BadRequestException('Invalid workflow id');
    }

    const workflow = await this.model.findOne({
      _id: new Types.ObjectId(workflowId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!workflow) {
      throw new NotFoundException('Agent workflow not found');
    }

    return workflow;
  }

  private recordTransition(
    workflow: AgentWorkflowDocument,
    to: AgentWorkflowPhase,
    trigger: AgentWorkflowTrigger,
    actor: AgentWorkflowActor,
  ): void {
    const from = workflow.currentPhase;

    workflow.phaseHistory = [
      ...workflow.phaseHistory,
      {
        actor,
        from,
        timestamp: new Date(),
        to,
        trigger,
      },
    ];
    workflow.currentPhase = to;
    workflow.gateStatus = computeAgentWorkflowGateStatus({
      approaches: workflow.approaches,
      currentPhase: workflow.currentPhase,
      isLocked: workflow.isLocked,
      messages: workflow.messages,
      questions: workflow.questions,
      selectedApproachId: workflow.selectedApproachId,
      verificationEvidence: workflow.verificationEvidence,
    });

    this.logger.debug('Agent workflow transition recorded', {
      actor,
      from,
      to,
      trigger,
      workflowId: String(workflow._id),
    });
  }

  private toApiState(workflow: AgentWorkflowDocument): WorkflowApiState {
    return {
      agentId: workflow.agentId,
      approaches: workflow.approaches,
      currentPhase: workflow.currentPhase,
      gateStatus: workflow.gateStatus,
      id: String(workflow._id),
      isLocked: workflow.isLocked,
      linkedConversationId: workflow.linkedConversationId ?? null,
      messages: workflow.messages,
      phaseHistory: workflow.phaseHistory.map((entry) => ({
        actor: entry.actor,
        from: entry.from,
        timestamp: entry.timestamp.toISOString(),
        to: entry.to,
        trigger: entry.trigger,
      })),
      questions: workflow.questions,
      selectedApproachId: workflow.selectedApproachId ?? null,
      verificationEvidence: workflow.verificationEvidence,
    };
  }
}
