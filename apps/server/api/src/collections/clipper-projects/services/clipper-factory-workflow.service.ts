import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import {
  buildClipperFactoryFailureWorkflowDefinition,
  buildClipperFactoryWorkflowDefinition,
  buildClipperGenerationChildWorkflowDefinition,
  CLIPPER_FACTORY_ACTION_IDS,
  CLIPPER_FACTORY_WORKFLOW_ID,
} from '@api/collections/clipper-projects/services/clipper-factory-workflow-definition';
import type {
  ClipperGenerationInput,
  ClipperGenerationResult,
  ClipperHighlight,
  ClipperHookReviewContext,
} from '@api/collections/clipper-projects/services/clipper-generation.service';
import { toClipFailureMessage } from '@api/collections/clipper-projects/services/clipper-source-contract.util';
import { assertClipperWorkflowActor } from '@api/collections/clipper-projects/services/clipper-workflow-actor.util';
import { settleClipperWorkflowFailure } from '@api/collections/clipper-projects/services/clipper-workflow-terminal-failure.util';
import { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import {
  type ClipperFactoryWorkflowInput,
  type ClipperSourceContract,
  DEFAULT_CLIP_RESULT_MODE,
  isClipperResultMode,
  isSupportedAvatarVideoProviderName,
} from '@genfeedai/contracts/interfaces';
import { Injectable, type OnModuleInit } from '@nestjs/common';

type HighlightedClipperFactoryInput = {
  data: ClipperFactoryWorkflowInput;
  highlights: ClipperHighlight[];
  sourceArtifact?: {
    mediaUrl: string;
    storageKey?: string;
  };
  sourceUrl: string;
  transcription: {
    segments: ClipperGenerationInput['transcriptSegments'];
    text: string;
  };
};

export type ClipperFactoryGenerationPlan = {
  baseInput: { request: ClipperGenerationInput };
  hookItems: number[];
  hookReviewRequired: boolean;
  remainingItems: number[];
};

@Injectable()
export class ClipperFactoryWorkflowService implements OnModuleInit {
  constructor(
    private readonly clipperProjects: ClipperProjectsService,
    private readonly clipperResults: ClipperResultsService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      CLIPPER_FACTORY_ACTION_IDS.PLAN_GENERATION,
      (request) => this.planGeneration(request),
    );
    this.runner.registerAction(CLIPPER_FACTORY_ACTION_IDS.FAIL, (request) =>
      this.fail(request),
    );
    this.runner.registerAction(
      CLIPPER_FACTORY_ACTION_IDS.FINALIZE_CHILD,
      (request) => this.finalizeChild(request),
    );
    this.runner.registerWorkflow(buildClipperFactoryWorkflowDefinition());
    this.runner.terminalFailures.register(
      CLIPPER_FACTORY_WORKFLOW_ID,
      (request) => settleClipperWorkflowFailure(this.clipperProjects, request),
    );
    this.runner.registerWorkflow(
      buildClipperFactoryFailureWorkflowDefinition(),
    );
    this.runner.registerWorkflow(
      buildClipperGenerationChildWorkflowDefinition(),
    );
  }

  private async planGeneration(
    action: SystemWorkflowActionRequest,
  ): Promise<ClipperFactoryGenerationPlan> {
    const highlighted = action.input.highlighted
      ? this.readHighlighted(action.input.highlighted)
      : undefined;
    const request = highlighted
      ? this.toGenerationRequest(highlighted)
      : this.readGenerationRequest(action.input.request);
    assertClipperWorkflowActor(action, request);
    const { highlights } = request;
    const reviewContext = this.readReviewContext(action.input.reviewContext);
    const mode = request.mode ?? DEFAULT_CLIP_RESULT_MODE;
    if (!isClipperResultMode(mode)) {
      throw new Error(`Unknown clip generation mode "${mode}".`);
    }
    if (
      mode === 'avatar' &&
      (!request.provider ||
        !isSupportedAvatarVideoProviderName(request.provider))
    ) {
      throw new Error('Clip generation requires a supported avatar provider.');
    }
    if (
      mode === 'avatar' &&
      request.provider !== 'genfeedai' &&
      (!request.avatarId || !request.voiceId)
    ) {
      throw new Error('Avatar clip generation requires avatarId and voiceId.');
    }
    if (
      mode === 'avatar' &&
      request.provider === 'genfeedai' &&
      !request.referenceImageUrl &&
      !request.runReferences?.some(
        (reference) =>
          reference.role === 'character' && reference.url.length > 0,
      )
    ) {
      throw new Error(
        'GenfeedAI managed clip generation requires a brand character reference.',
      );
    }

    const hookReviewRequired =
      (request.hookApprovalRequired ??
        (mode === 'avatar' && highlights.length > 1)) &&
      highlights.length > 1;
    const hookIndex = hookReviewRequired
      ? Math.max(
          highlights.findIndex(
            (highlight) => highlight.clip_type.toLowerCase() === 'hook',
          ),
          0,
        )
      : -1;
    const allIndices = highlights.map((_highlight, index) => index);
    const hookItems = hookIndex >= 0 ? [hookIndex] : [];
    const remainingItems =
      hookIndex >= 0
        ? allIndices.filter((index) => index !== hookIndex)
        : allIndices;

    await this.clipperProjects.patch(
      request.projectId,
      highlights.length === 0
        ? { progress: 100, status: 'completed' }
        : {
            clipperHookReviewAttempt: reviewContext.attempt,
            clipperHookReviewFeedback: reviewContext.feedback ?? null,
            clipperHookReviewLastAction: reviewContext.lastAction ?? null,
            continuityQaStatus: hookReviewRequired ? 'pending' : 'not-required',
            continuityWorkflowExecutionId: null,
            progress: 50,
            status: 'generating',
            workflowExecutionId: action.provenance.executionId,
          },
      [],
      request.orgId,
    );

    return {
      baseInput: { request: this.serializable(request) },
      hookItems,
      hookReviewRequired,
      remainingItems,
    };
  }

  private toGenerationRequest(
    highlighted: HighlightedClipperFactoryInput,
  ): ClipperGenerationInput {
    const { data, highlights } = highlighted;
    return {
      avatarId: data.avatarId,
      avatarRef: data.avatarRef,
      voiceRef: data.voiceRef,
      highlights,
      mode: data.mode ?? DEFAULT_CLIP_RESULT_MODE,
      orgId: data.orgId,
      projectId: data.projectId,
      provider: data.avatarProvider,
      referenceImageUrl: data.referenceImageUrl,
      runReferences: data.runReferences,
      sourceVideoS3Key: highlighted.sourceArtifact?.storageKey,
      sourceVideoUrl:
        highlighted.sourceArtifact?.mediaUrl ?? highlighted.sourceUrl,
      transcriptSegments: highlighted.transcription.segments,
      transcriptText: highlighted.transcription.text,
      userId: data.userId,
      voiceId: data.voiceId,
    };
  }

  private async fail(
    action: SystemWorkflowActionRequest,
  ): Promise<{ projectId: string; status: 'failed' }> {
    const data = this.readJobData(action.input.job);
    assertClipperWorkflowActor(action, data);
    const workflowError = this.requiredString(
      action.input.workflowError,
      'workflowError',
    );
    const project = await this.clipperProjects.findOne({
      id: data.projectId,
      isDeleted: false,
      organizationId: data.orgId,
    });
    // A failure graph from an attempt the creator already retried must not
    // overwrite the newer run.
    if (
      project?.source &&
      data.source &&
      (project.source.fingerprint !== data.source.fingerprint ||
        project.source.retryCount !== data.source.retryCount)
    ) {
      return { projectId: data.projectId, status: 'failed' };
    }
    const message = toClipFailureMessage(workflowError);
    // The stored source keeps artifacts materialized by earlier nodes.
    const source = await this.failedSource(
      project?.source ?? data.source,
      message,
      data,
    );
    await this.clipperProjects.patch(
      data.projectId,
      {
        error: message,
        ...(source ? { source } : {}),
        status: 'failed',
      },
      [],
      data.orgId,
    );
    return { projectId: data.projectId, status: 'failed' };
  }

  private async finalizeChild(action: SystemWorkflowActionRequest): Promise<
    ClipperGenerationResult & {
      expectedClipCount: number;
      observedClipCount: number;
      originalIndex: number;
      reconciled: boolean;
    }
  > {
    const request = this.readGenerationRequest(action.input.request);
    assertClipperWorkflowActor(action, request);
    const originalIndex = this.requiredNumber(
      action.input.originalIndex,
      'originalIndex',
    );
    if (
      !Number.isInteger(originalIndex) ||
      !request.highlights[originalIndex]
    ) {
      throw new Error(
        `Clip child finalization cannot resolve highlight ${originalIndex}`,
      );
    }
    const rows = await this.clipperResults.findByProject(
      request.projectId,
      request.orgId,
    );
    const expectedClipCount = request.highlights.length;
    const observedClipCount = rows.length;
    const reconciled = observedClipCount >= expectedClipCount;
    if (reconciled) {
      await this.clipperProjects.reconcileTerminalState(
        request.projectId,
        request.orgId,
      );
    }
    const generation = this.readGenerationResult(action.input.generation);
    return {
      ...generation,
      expectedClipCount,
      observedClipCount,
      originalIndex,
      reconciled,
    };
  }

  /**
   * A failure before any clip exists (highlights, planning) is retried from
   * the source, which reuses the saved transcript. Once clips exist, the
   * completed source stays as is and failed clips are retried instead.
   */
  private async failedSource(
    source: ClipperSourceContract | undefined,
    message: string,
    data: ClipperFactoryWorkflowInput,
  ): Promise<ClipperSourceContract | undefined> {
    if (!source) {
      return source;
    }
    if (source.status === 'completed') {
      const clips = await this.clipperResults.findByProject(
        data.projectId,
        data.orgId,
      );
      if (clips.length > 0) {
        return source;
      }
    }
    return {
      ...source,
      failure: {
        code: 'clip_source_processing_failed',
        message,
        retryable: true,
      },
      status: 'failed',
      updatedAt: new Date().toISOString(),
    };
  }

  private readHighlighted(value: unknown): HighlightedClipperFactoryInput {
    const highlighted = this.readRecord(value);
    const data = this.readJobData(highlighted.data);
    const highlights = Array.isArray(highlighted.highlights)
      ? (highlighted.highlights as ClipperHighlight[])
      : [];
    const transcription = this.readRecord(highlighted.transcription);
    const sourceArtifact = this.readRecord(highlighted.sourceArtifact);
    return {
      data,
      highlights,
      ...(typeof sourceArtifact.mediaUrl === 'string'
        ? {
            sourceArtifact: {
              mediaUrl: sourceArtifact.mediaUrl,
              ...(typeof sourceArtifact.storageKey === 'string'
                ? { storageKey: sourceArtifact.storageKey }
                : {}),
            },
          }
        : {}),
      sourceUrl: this.requiredString(highlighted.sourceUrl, 'sourceUrl'),
      transcription: {
        segments: Array.isArray(transcription.segments)
          ? (transcription.segments as NonNullable<
              ClipperGenerationInput['transcriptSegments']
            >)
          : [],
        text: this.requiredString(transcription.text, 'transcription.text'),
      },
    };
  }

  private readJobData(value: unknown): ClipperFactoryWorkflowInput {
    const data = this.readRecord(value);
    return {
      ...data,
      language: this.requiredString(data.language, 'language'),
      maxClips: this.requiredNumber(data.maxClips, 'maxClips'),
      minViralityScore: this.requiredNumber(
        data.minViralityScore,
        'minViralityScore',
      ),
      orgId: this.requiredString(data.orgId, 'orgId'),
      projectId: this.requiredString(data.projectId, 'projectId'),
      userId: this.requiredString(data.userId, 'userId'),
      youtubeUrl: this.requiredString(data.youtubeUrl, 'youtubeUrl'),
    } as ClipperFactoryWorkflowInput;
  }

  private readGenerationRequest(value: unknown): ClipperGenerationInput {
    const request = this.readRecord(value);
    if (!Array.isArray(request.highlights)) {
      throw new Error('Missing required clip factory input: highlights');
    }
    return {
      ...request,
      highlights: request.highlights as ClipperHighlight[],
      orgId: this.requiredString(request.orgId, 'orgId'),
      projectId: this.requiredString(request.projectId, 'projectId'),
      userId: this.requiredString(request.userId, 'userId'),
    } as ClipperGenerationInput;
  }

  private readReviewContext(value: unknown): ClipperHookReviewContext {
    const context = this.readRecord(value);
    const attempt = this.requiredNumber(context.attempt ?? 1, 'attempt');
    if (!Number.isInteger(attempt) || attempt < 1) {
      throw new Error(
        'Clip generation review attempt must be a positive integer',
      );
    }
    return {
      attempt,
      ...(typeof context.feedback === 'string'
        ? { feedback: context.feedback }
        : {}),
      ...(context.lastAction === 'approve' ||
      context.lastAction === 'request_changes' ||
      context.lastAction === 'reject'
        ? { lastAction: context.lastAction }
        : {}),
    };
  }

  private readGenerationResult(value: unknown): ClipperGenerationResult {
    const result = this.readRecord(value);
    return {
      clipperResultIds: Array.isArray(result.clipperResultIds)
        ? result.clipperResultIds.filter(
            (candidate): candidate is string => typeof candidate === 'string',
          )
        : [],
      providerJobIds: Array.isArray(result.providerJobIds)
        ? result.providerJobIds.filter(
            (candidate): candidate is string => typeof candidate === 'string',
          )
        : [],
      queuedClipCount:
        typeof result.queuedClipCount === 'number' ? result.queuedClipCount : 0,
      ...(typeof result.completedClipCount === 'number'
        ? { completedClipCount: result.completedClipCount }
        : {}),
    };
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Missing required clip factory input: ${field}`);
    }
    return value;
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Missing required clip factory input: ${field}`);
    }
    return value.trim();
  }

  private serializable(input: ClipperGenerationInput): ClipperGenerationInput {
    return JSON.parse(JSON.stringify(input)) as ClipperGenerationInput;
  }
}
