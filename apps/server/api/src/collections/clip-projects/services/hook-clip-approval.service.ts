import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import {
  type ClipGenerationInput,
  ClipGenerationService,
} from '@api/collections/clip-projects/services/clip-generation.service';
import { CLIP_HOOK_REVIEW_NODE_ID } from '@api/collections/clip-projects/services/clip-generation-workflow-definition';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { WorkflowExecutionDocument } from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import type {
  HookClipApprovalAction,
  HookClipApprovalStatus,
} from '@genfeedai/interfaces';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export interface SubmitHookClipDecisionInput {
  action: HookClipApprovalAction;
  organizationId: string;
  projectId: string;
  userId: string;
  feedback?: string;
}

type HookWorkflowState = {
  attempt: number;
  execution: WorkflowExecutionDocument;
  feedback?: string;
  hookClipResultId?: string;
  lastAction?: HookClipApprovalAction;
  remainingClipCount: number;
  request: ClipGenerationInput;
  state: HookClipApprovalStatus['state'];
  workflowId: string;
};

@Injectable()
export class HookClipApprovalService {
  constructor(
    private readonly clipResultsService: ClipResultsService,
    private readonly clipGenerationService: ClipGenerationService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  async getStatus(
    projectId: string,
    organizationId: string,
  ): Promise<HookClipApprovalStatus> {
    const state = await this.resolveWorkflowState(projectId, organizationId);
    return state ? this.toStatus(state) : this.emptyStatus();
  }

  async submitDecision(
    input: SubmitHookClipDecisionInput,
  ): Promise<HookClipApprovalStatus> {
    const state = await this.resolveWorkflowState(
      input.projectId,
      input.organizationId,
    );
    if (state?.state !== 'awaiting_confirmation') {
      throw new BadRequestException(
        'The hook clip is not awaiting an operator decision.',
      );
    }

    if (input.action !== 'reject') {
      await this.assertCredits(
        input.organizationId,
        input.action === 'approve' ? state.remainingClipCount : 1,
      );
    }

    if (input.action === 'request_changes') {
      return this.requestChanges(state, input);
    }
    if (input.action === 'reject') {
      return this.reject(state, input);
    }
    return this.approve(state, input);
  }

  isProjectReconciliationBlocked(status: HookClipApprovalStatus): boolean {
    return [
      'awaiting_confirmation',
      'failed',
      'generating_hook',
      'rejected',
      'resuming',
    ].includes(status.state);
  }

  private async approve(
    state: HookWorkflowState,
    input: SubmitHookClipDecisionInput,
  ): Promise<HookClipApprovalStatus> {
    await this.requireWorkflowExecutor().submitReviewGateApproval(
      state.workflowId,
      state.execution.id,
      input.userId,
      input.organizationId,
      CLIP_HOOK_REVIEW_NODE_ID,
      true,
    );
    await this.clipProjectsService.patch(
      input.projectId,
      {
        clipHookReviewFeedback: input.feedback ?? null,
        clipHookReviewLastAction: 'approve',
        error: null,
        status: 'generating',
      },
      [],
      input.organizationId,
    );
    return this.getStatus(input.projectId, input.organizationId);
  }

  private async requestChanges(
    state: HookWorkflowState,
    input: SubmitHookClipDecisionInput,
  ): Promise<HookClipApprovalStatus> {
    const reason = input.feedback?.trim() || 'Hook revision requested.';
    await this.requireWorkflowExecutor().submitReviewGateApproval(
      state.workflowId,
      state.execution.id,
      input.userId,
      input.organizationId,
      CLIP_HOOK_REVIEW_NODE_ID,
      false,
      reason,
    );
    if (state.hookClipResultId) {
      await this.clipResultsService.patch(
        state.hookClipResultId,
        { isDeleted: true },
        [],
        input.organizationId,
      );
    }
    await this.clipProjectsService.patch(
      input.projectId,
      { error: null, status: 'generating' },
      [],
      input.organizationId,
    );

    try {
      await this.clipGenerationService.generateClips(
        this.withRevisionGuidance(state.request, reason),
        {
          attempt: state.attempt + 1,
          feedback: reason,
          lastAction: 'request_changes',
        },
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Hook revision workflow failed to start.';
      await this.clipProjectsService.patch(
        input.projectId,
        { error: message, progress: 100, status: 'failed' },
        [],
        input.organizationId,
      );
    }
    return this.getStatus(input.projectId, input.organizationId);
  }

  private async reject(
    state: HookWorkflowState,
    input: SubmitHookClipDecisionInput,
  ): Promise<HookClipApprovalStatus> {
    const reason = input.feedback?.trim() || 'Hook clip rejected by reviewer.';
    await this.requireWorkflowExecutor().submitReviewGateApproval(
      state.workflowId,
      state.execution.id,
      input.userId,
      input.organizationId,
      CLIP_HOOK_REVIEW_NODE_ID,
      false,
      reason,
    );
    await this.clipProjectsService.patch(
      input.projectId,
      {
        clipHookReviewFeedback: reason,
        clipHookReviewLastAction: 'reject',
        error: reason,
        progress: 100,
        status: 'failed',
      },
      [],
      input.organizationId,
    );
    return {
      attempt: state.attempt,
      feedback: reason,
      ...(state.hookClipResultId
        ? { hookClipResultId: state.hookClipResultId }
        : {}),
      lastAction: 'reject',
      remainingClipCount: state.remainingClipCount,
      state: 'rejected',
    };
  }

  private async resolveWorkflowState(
    projectId: string,
    organizationId: string,
  ): Promise<HookWorkflowState | undefined> {
    const project = await this.clipProjectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId,
    });
    const workflowExecutionId = this.readString(project?.workflowExecutionId);
    if (!project || !workflowExecutionId) {
      return undefined;
    }

    const execution = await this.requireWorkflowExecutions().findOne({
      id: workflowExecutionId,
      isDeleted: false,
      organizationId,
    });
    if (!execution) {
      return undefined;
    }
    const request = this.resolveGenerationRequest(execution);
    if (!this.isHookReviewRequired(request)) {
      return undefined;
    }

    const hookClipResultId = this.resolveHookClipResultId(execution);
    const attempt = this.readPositiveInteger(
      execution.metadata?.clipHookReviewAttempt ??
        project.clipHookReviewAttempt,
      1,
    );
    const feedback = this.readString(
      execution.metadata?.clipHookReviewFeedback ??
        project.clipHookReviewFeedback,
    );
    const lastAction = this.readAction(
      execution.metadata?.clipHookReviewLastAction ??
        project.clipHookReviewLastAction,
    );
    const workflowId = this.readString(execution.workflowId);
    if (!workflowId) {
      throw new Error('Clip workflow execution has no workflow identity');
    }

    let state: HookClipApprovalStatus['state'];
    if (String(execution.status) === WorkflowExecutionStatus.FAILED) {
      state = lastAction === 'reject' ? 'rejected' : 'failed';
    } else if (!hookClipResultId) {
      state = 'generating_hook';
    } else {
      const hookResult = await this.clipResultsService.findOne({
        id: hookClipResultId,
        isDeleted: false,
        organizationId,
        projectId,
      });
      const hookStatus = this.readString(hookResult?.status);
      if (hookStatus === 'failed' || hookStatus === 'degraded') {
        state = 'failed';
      } else if (this.hasPendingReview(execution)) {
        state =
          hookStatus === 'completed'
            ? 'awaiting_confirmation'
            : 'generating_hook';
      } else if (
        String(execution.status) === WorkflowExecutionStatus.COMPLETED
      ) {
        state = 'approved';
      } else {
        state = 'resuming';
      }
    }

    return {
      attempt,
      execution,
      ...(feedback ? { feedback } : {}),
      ...(hookClipResultId ? { hookClipResultId } : {}),
      ...(lastAction ? { lastAction } : {}),
      remainingClipCount: request.highlights.length - 1,
      request,
      state,
      workflowId,
    };
  }

  private hasPendingReview(execution: WorkflowExecutionDocument): boolean {
    const pending = execution.metadata?.pendingApproval;
    return (
      pending !== null &&
      typeof pending === 'object' &&
      !Array.isArray(pending) &&
      (pending as Record<string, unknown>).nodeId === CLIP_HOOK_REVIEW_NODE_ID
    );
  }

  private withRevisionGuidance(
    input: ClipGenerationInput,
    feedback: string,
  ): ClipGenerationInput {
    const hookIndex = this.resolveHookIndex(input);
    return {
      ...input,
      highlights: input.highlights.map((highlight, index) =>
        index === hookIndex
          ? {
              ...highlight,
              summary: `${highlight.summary}\nRevision guidance: ${feedback}`,
            }
          : highlight,
      ),
    };
  }

  private async assertCredits(
    organizationId: string,
    requiredCredits: number,
  ): Promise<void> {
    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        requiredCredits,
      );
    if (hasCredits) {
      return;
    }
    const balance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );
    throw new InsufficientCreditsException(requiredCredits, balance);
  }

  private readGenerationInput(value: unknown): ClipGenerationInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Clip workflow execution has no generation request');
    }
    const request = value as Partial<ClipGenerationInput>;
    if (
      !Array.isArray(request.highlights) ||
      typeof request.orgId !== 'string' ||
      typeof request.projectId !== 'string' ||
      typeof request.userId !== 'string'
    ) {
      throw new Error('Clip workflow execution has an invalid request');
    }
    return request as ClipGenerationInput;
  }

  private resolveGenerationRequest(
    execution: WorkflowExecutionDocument,
  ): ClipGenerationInput {
    if (execution.inputValues?.request) {
      return this.readGenerationInput(execution.inputValues.request);
    }
    const plan = execution.nodeResults.find(
      (nodeResult) => nodeResult.nodeId === 'plan-generation',
    );
    const output = this.readRecord(plan?.output);
    const baseInput = this.readRecord(output.baseInput);
    return this.readGenerationInput(baseInput.request);
  }

  private resolveHookClipResultId(
    execution: WorkflowExecutionDocument,
  ): string | undefined {
    const hookDispatch = execution.nodeResults.find(
      (nodeResult) => nodeResult.nodeId === 'generate-hook',
    );
    const output = this.readRecord(hookDispatch?.output);
    const first = Array.isArray(output.results) ? output.results[0] : undefined;
    const childResult = this.readRecord(this.readRecord(first).result);
    return this.readFirstString(childResult.clipResultIds);
  }

  private isHookReviewRequired(input: ClipGenerationInput): boolean {
    return (
      (input.hookApprovalRequired ??
        ((input.mode ?? 'avatar') === 'avatar' &&
          input.highlights.length > 1)) &&
      input.highlights.length > 1
    );
  }

  private resolveHookIndex(input: ClipGenerationInput): number {
    const index = input.highlights.findIndex(
      (highlight) => highlight.clip_type.toLowerCase() === 'hook',
    );
    return index >= 0 ? index : 0;
  }

  private readAction(value: unknown): HookClipApprovalAction | undefined {
    return value === 'approve' ||
      value === 'request_changes' ||
      value === 'reject'
      ? value
      : undefined;
  }

  private readFirstString(value: unknown): string | undefined {
    return Array.isArray(value) ? this.readString(value[0]) : undefined;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readPositiveInteger(value: unknown, fallback: number): number {
    return Number.isInteger(value) && Number(value) > 0
      ? Number(value)
      : fallback;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private emptyStatus(): HookClipApprovalStatus {
    return { attempt: 0, remainingClipCount: 0, state: 'not_required' };
  }

  private toStatus(state: HookWorkflowState): HookClipApprovalStatus {
    return {
      attempt: state.attempt,
      ...(state.feedback ? { feedback: state.feedback } : {}),
      ...(state.hookClipResultId
        ? { hookClipResultId: state.hookClipResultId }
        : {}),
      ...(state.lastAction ? { lastAction: state.lastAction } : {}),
      remainingClipCount: state.remainingClipCount,
      state: state.state,
    };
  }

  private requireWorkflowExecutor(): WorkflowExecutorService {
    if (!this.moduleRef) {
      throw new Error('Workflow executor is unavailable');
    }
    return this.moduleRef.get(WorkflowExecutorService, { strict: false });
  }

  private requireWorkflowExecutions(): WorkflowExecutionsService {
    if (!this.moduleRef) {
      throw new Error('Workflow executions service is unavailable');
    }
    return this.moduleRef.get(WorkflowExecutionsService, { strict: false });
  }
}
