import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import {
  ClipOrchestratorService,
  type ClipRun,
} from '@api/services/clip-orchestrator/clip-orchestrator.service';
import { ClipRunState } from '@api/services/clip-orchestrator/clip-run-state.enum';
import type {
  HookClipApprovalAction,
  HookClipApprovalStatus,
} from '@genfeedai/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type ClipGenerationInput,
  ClipGenerationService,
  type HookClipApprovalPlan,
} from './clip-generation.service';

export interface SubmitHookClipDecisionInput {
  action: HookClipApprovalAction;
  organizationId: string;
  projectId: string;
  userId: string;
  feedback?: string;
}

@Injectable()
export class HookClipApprovalService {
  constructor(
    private readonly orchestrator: ClipOrchestratorService,
    private readonly clipResultsService: ClipResultsService,
    private readonly clipGenerationService: ClipGenerationService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly creditsUtilsService: CreditsUtilsService,
  ) {}

  async getStatus(
    projectId: string,
    organizationId: string,
  ): Promise<HookClipApprovalStatus> {
    const run = await this.orchestrator.getProjectRun(
      projectId,
      organizationId,
    );
    const plan = run ? this.readPlan(run) : undefined;
    if (!run || !plan) {
      return this.toStatus('not_required');
    }

    if (run.currentState === ClipRunState.AwaitingConfirmation) {
      return this.toStatus('awaiting_confirmation', plan);
    }
    if (run.currentState === ClipRunState.Failed) {
      return this.toStatus(
        plan.phase === 'rejected' ? 'rejected' : 'failed',
        plan,
      );
    }
    if (plan.phase === 'approved') {
      return this.toStatus('approved', plan);
    }
    if (plan.phase === 'resuming') {
      return this.toStatus('resuming', plan);
    }

    const hookResult = await this.clipResultsService.findOne({
      id: plan.hookClipResultId,
      isDeleted: false,
      organizationId,
      projectId,
    });
    const hookStatus =
      typeof hookResult?.status === 'string' ? hookResult.status : undefined;

    if (hookStatus === 'failed') {
      const reason = 'Hook clip generation failed before approval.';
      await this.orchestrator.reject(run.id, reason);
      const failedPlan = {
        ...plan,
        feedback: reason,
        phase: 'failed' as const,
      };
      await this.orchestrator.updateMetadata(run.id, {
        hookApproval: failedPlan,
      });
      await this.clipProjectsService.patch(projectId, {
        error: reason,
        progress: 100,
        status: 'failed',
      });
      return this.toStatus('failed', failedPlan);
    }

    if (hookStatus === 'completed') {
      await this.orchestrator.completeStep(run.id, {
        hookClipResultId: plan.hookClipResultId,
      });
      await this.orchestrator.requestConfirmation(
        run.id,
        ClipRunState.Generating,
      );
      // Provider completion reconciliation may have observed only the hook.
      // Keep the project active while the durable run is paused for review.
      await this.clipProjectsService.patch(projectId, {
        error: null,
        status: 'generating',
      });
      return this.toStatus('awaiting_confirmation', plan);
    }

    return this.toStatus('generating_hook', plan);
  }

  async submitDecision(
    input: SubmitHookClipDecisionInput,
  ): Promise<HookClipApprovalStatus> {
    await this.getStatus(input.projectId, input.organizationId);
    const run = await this.orchestrator.getProjectRun(
      input.projectId,
      input.organizationId,
    );
    const plan = run ? this.readPlan(run) : undefined;
    if (
      !run ||
      !plan ||
      run.currentState !== ClipRunState.AwaitingConfirmation
    ) {
      throw new BadRequestException(
        'The hook clip is not awaiting an operator decision.',
      );
    }

    const requiredCredits =
      input.action === 'approve' ? plan.remainingInput.highlights.length : 1;
    if (input.action !== 'reject') {
      await this.assertCredits(input.organizationId, requiredCredits);
    }

    const claimed = await this.orchestrator.claimConfirmation(
      run.id,
      plan.attempt,
    );
    if (!claimed) {
      throw new BadRequestException(
        'This hook approval was already resolved by another reviewer.',
      );
    }

    if (input.action === 'reject') {
      return this.reject(run, plan, input);
    }
    if (input.action === 'request_changes') {
      return this.requestChanges(run, plan, input);
    }
    return this.approve(run, plan, input);
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
    run: ClipRun,
    plan: HookClipApprovalPlan,
    input: SubmitHookClipDecisionInput,
  ): Promise<HookClipApprovalStatus> {
    await this.orchestrator.confirm(run.id);
    const resumingPlan: HookClipApprovalPlan = {
      ...plan,
      feedback: input.feedback,
      lastAction: 'approve',
      phase: 'resuming',
    };
    await this.orchestrator.updateMetadata(run.id, {
      hookApproval: resumingPlan,
      hookApprovalReviewedBy: input.userId,
    });
    await this.clipProjectsService.patch(input.projectId, {
      error: null,
      status: 'generating',
    });

    const result = await this.clipGenerationService
      .generateClips(plan.remainingInput)
      .catch(() => undefined);
    if (!result || result.queuedClipCount === 0) {
      return this.failResume(run, resumingPlan, input.projectId);
    }

    const approvedPlan: HookClipApprovalPlan = {
      ...resumingPlan,
      phase: 'approved',
    };
    await this.orchestrator.updateMetadata(run.id, {
      hookApproval: approvedPlan,
    });
    return this.toStatus('approved', approvedPlan);
  }

  private async requestChanges(
    run: ClipRun,
    plan: HookClipApprovalPlan,
    input: SubmitHookClipDecisionInput,
  ): Promise<HookClipApprovalStatus> {
    await this.orchestrator.confirm(run.id);
    const resumingPlan: HookClipApprovalPlan = {
      ...plan,
      feedback: input.feedback,
      lastAction: 'request_changes',
      phase: 'resuming',
    };
    await this.orchestrator.updateMetadata(run.id, {
      hookApproval: resumingPlan,
      hookApprovalReviewedBy: input.userId,
    });
    const result = await this.clipGenerationService
      .generateClips(this.withRevisionGuidance(plan.hookInput, input.feedback))
      .catch(() => undefined);
    const hookClipResultId = result?.clipResultIds[0];
    if (!result || !hookClipResultId || result.queuedClipCount === 0) {
      return this.failResume(run, resumingPlan, input.projectId);
    }
    await this.clipResultsService.patch(plan.hookClipResultId, {
      isDeleted: true,
    });

    const nextPlan: HookClipApprovalPlan = {
      ...resumingPlan,
      attempt: plan.attempt + 1,
      feedback: input.feedback,
      hookClipResultId,
      phase: 'generating_hook',
    };
    await this.orchestrator.updateMetadata(run.id, {
      hookApproval: nextPlan,
    });
    await this.clipProjectsService.patch(input.projectId, {
      error: null,
      status: 'generating',
    });
    return this.toStatus('generating_hook', nextPlan);
  }

  private async reject(
    run: ClipRun,
    plan: HookClipApprovalPlan,
    input: SubmitHookClipDecisionInput,
  ): Promise<HookClipApprovalStatus> {
    const reason = input.feedback?.trim() || 'Hook clip rejected by reviewer.';
    const rejectedPlan: HookClipApprovalPlan = {
      ...plan,
      feedback: reason,
      lastAction: 'reject',
      phase: 'rejected',
    };
    await this.orchestrator.updateMetadata(run.id, {
      hookApproval: rejectedPlan,
      hookApprovalReviewedBy: input.userId,
    });
    await this.orchestrator.reject(run.id, reason);
    await this.clipProjectsService.patch(input.projectId, {
      error: reason,
      progress: 100,
      status: 'failed',
    });
    return this.toStatus('rejected', rejectedPlan);
  }

  private async failResume(
    run: ClipRun,
    plan: HookClipApprovalPlan,
    projectId: string,
  ): Promise<HookClipApprovalStatus> {
    const reason = 'Clip generation failed before a provider job was queued.';
    const failedPlan: HookClipApprovalPlan = {
      ...plan,
      feedback: reason,
      phase: 'failed',
    };
    await this.orchestrator.updateMetadata(run.id, {
      hookApproval: failedPlan,
    });
    await this.orchestrator.reject(run.id, reason);
    await this.clipProjectsService.patch(projectId, {
      error: reason,
      progress: 100,
      status: 'failed',
    });
    return this.toStatus('failed', failedPlan);
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

  private readPlan(run: ClipRun): HookClipApprovalPlan | undefined {
    const candidate = run.metadata?.hookApproval;
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      return undefined;
    }
    const plan = candidate as Partial<HookClipApprovalPlan>;
    if (
      typeof plan.attempt !== 'number' ||
      typeof plan.hookClipResultId !== 'string' ||
      !this.isGenerationInput(plan.hookInput) ||
      !this.isGenerationInput(plan.remainingInput) ||
      typeof plan.phase !== 'string'
    ) {
      return undefined;
    }
    return {
      ...(plan as HookClipApprovalPlan),
      hookInput: this.freezeReferences(plan.hookInput),
      remainingInput: this.freezeReferences(plan.remainingInput),
    };
  }

  private freezeReferences(input: ClipGenerationInput): ClipGenerationInput {
    return {
      ...input,
      runReferences: Object.freeze(
        (input.runReferences ?? []).map((reference) =>
          Object.freeze({ ...reference }),
        ),
      ),
    };
  }

  private withRevisionGuidance(
    input: ClipGenerationInput,
    feedback?: string,
  ): ClipGenerationInput {
    const guidance = feedback?.trim();
    if (!guidance) {
      return input;
    }
    return {
      ...input,
      highlights: input.highlights.map((highlight, index) =>
        index === 0
          ? {
              ...highlight,
              summary: `${highlight.summary}\nRevision guidance: ${guidance}`,
            }
          : highlight,
      ),
    };
  }

  private isGenerationInput(value: unknown): value is ClipGenerationInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const input = value as Partial<ClipGenerationInput>;
    return (
      Array.isArray(input.highlights) &&
      typeof input.orgId === 'string' &&
      typeof input.projectId === 'string' &&
      typeof input.userId === 'string'
    );
  }

  private toStatus(
    state: HookClipApprovalStatus['state'],
    plan?: HookClipApprovalPlan,
  ): HookClipApprovalStatus {
    return {
      attempt: plan?.attempt ?? 0,
      ...(plan?.feedback ? { feedback: plan.feedback } : {}),
      ...(plan?.hookClipResultId
        ? { hookClipResultId: plan.hookClipResultId }
        : {}),
      ...(plan?.lastAction ? { lastAction: plan.lastAction } : {}),
      remainingClipCount: plan?.remainingInput.highlights.length ?? 0,
      state,
    };
  }
}
