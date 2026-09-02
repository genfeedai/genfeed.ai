import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import {
  buildClipFactoryFailureWorkflowDefinition,
  buildClipFactoryWorkflowDefinition,
  buildClipGenerationChildWorkflowDefinition,
  CLIP_FACTORY_ACTION_IDS,
} from '@api/collections/clip-projects/services/clip-factory-workflow-definition';
import type {
  ClipGenerationInput,
  ClipGenerationResult,
  ClipHighlight,
  ClipHookReviewContext,
} from '@api/collections/clip-projects/services/clip-generation.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import {
  type ClipFactoryWorkflowInput,
  type ClipSourceContract,
  DEFAULT_CLIP_RESULT_MODE,
  isClipResultMode,
  isSupportedAvatarVideoProviderName,
} from '@genfeedai/contracts/interfaces';
import { Injectable, type OnModuleInit } from '@nestjs/common';

type HighlightedClipFactoryInput = {
  data: ClipFactoryWorkflowInput;
  highlights: ClipHighlight[];
  sourceArtifact?: {
    mediaUrl: string;
    storageKey?: string;
  };
  sourceUrl: string;
  transcription: {
    segments: ClipGenerationInput['transcriptSegments'];
    text: string;
  };
};

export type ClipFactoryGenerationPlan = {
  baseInput: { request: ClipGenerationInput };
  hookItems: number[];
  hookReviewRequired: boolean;
  remainingItems: number[];
};

@Injectable()
export class ClipFactoryWorkflowService implements OnModuleInit {
  constructor(
    private readonly clipProjects: ClipProjectsService,
    private readonly clipResults: ClipResultsService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      CLIP_FACTORY_ACTION_IDS.PLAN_GENERATION,
      (request) => this.planGeneration(request),
    );
    this.runner.registerAction(CLIP_FACTORY_ACTION_IDS.FAIL, (request) =>
      this.fail(request),
    );
    this.runner.registerAction(
      CLIP_FACTORY_ACTION_IDS.FINALIZE_CHILD,
      (request) => this.finalizeChild(request),
    );
    this.runner.registerWorkflow(buildClipFactoryWorkflowDefinition());
    this.runner.registerWorkflow(buildClipFactoryFailureWorkflowDefinition());
    this.runner.registerWorkflow(buildClipGenerationChildWorkflowDefinition());
  }

  private async planGeneration(
    action: SystemWorkflowActionRequest,
  ): Promise<ClipFactoryGenerationPlan> {
    const highlighted = action.input.highlighted
      ? this.readHighlighted(action.input.highlighted)
      : undefined;
    const request = highlighted
      ? this.toGenerationRequest(highlighted)
      : this.readGenerationRequest(action.input.request);
    const { highlights } = request;
    const reviewContext = this.readReviewContext(action.input.reviewContext);
    const mode = request.mode ?? DEFAULT_CLIP_RESULT_MODE;
    if (!isClipResultMode(mode)) {
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

    await this.clipProjects.patch(
      request.projectId,
      highlights.length === 0
        ? { progress: 100, status: 'completed' }
        : {
            clipHookReviewAttempt: reviewContext.attempt,
            clipHookReviewFeedback: reviewContext.feedback ?? null,
            clipHookReviewLastAction: reviewContext.lastAction ?? null,
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
    highlighted: HighlightedClipFactoryInput,
  ): ClipGenerationInput {
    const { data, highlights } = highlighted;
    return {
      avatarId: data.avatarId,
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
    const workflowError = this.requiredString(
      action.input.workflowError,
      'workflowError',
    );
    const source = this.failedSource(data.source, workflowError);
    await this.clipProjects.patch(
      data.projectId,
      {
        error: workflowError,
        ...(source ? { source } : {}),
        status: 'failed',
      },
      [],
      data.orgId,
    );
    return { projectId: data.projectId, status: 'failed' };
  }

  private async finalizeChild(action: SystemWorkflowActionRequest): Promise<
    ClipGenerationResult & {
      expectedClipCount: number;
      observedClipCount: number;
      originalIndex: number;
      reconciled: boolean;
    }
  > {
    const request = this.readGenerationRequest(action.input.request);
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
    const rows = await this.clipResults.findByProject(
      request.projectId,
      request.orgId,
    );
    const expectedClipCount = request.highlights.length;
    const observedClipCount = rows.length;
    const reconciled = observedClipCount >= expectedClipCount;
    if (reconciled) {
      await this.clipProjects.reconcileTerminalState(
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

  private failedSource(
    source: ClipSourceContract | undefined,
    message: string,
  ): ClipSourceContract | undefined {
    if (!source || source.status === 'completed') {
      return source;
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

  private readHighlighted(value: unknown): HighlightedClipFactoryInput {
    const highlighted = this.readRecord(value);
    const data = this.readJobData(highlighted.data);
    const highlights = Array.isArray(highlighted.highlights)
      ? (highlighted.highlights as ClipHighlight[])
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
              ClipGenerationInput['transcriptSegments']
            >)
          : [],
        text: this.requiredString(transcription.text, 'transcription.text'),
      },
    };
  }

  private readJobData(value: unknown): ClipFactoryWorkflowInput {
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
    } as ClipFactoryWorkflowInput;
  }

  private readGenerationRequest(value: unknown): ClipGenerationInput {
    const request = this.readRecord(value);
    if (!Array.isArray(request.highlights)) {
      throw new Error('Missing required clip factory input: highlights');
    }
    return {
      ...request,
      highlights: request.highlights as ClipHighlight[],
      orgId: this.requiredString(request.orgId, 'orgId'),
      projectId: this.requiredString(request.projectId, 'projectId'),
      userId: this.requiredString(request.userId, 'userId'),
    } as ClipGenerationInput;
  }

  private readReviewContext(value: unknown): ClipHookReviewContext {
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

  private readGenerationResult(value: unknown): ClipGenerationResult {
    const result = this.readRecord(value);
    return {
      clipResultIds: Array.isArray(result.clipResultIds)
        ? result.clipResultIds.filter(
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

  private serializable(input: ClipGenerationInput): ClipGenerationInput {
    return JSON.parse(JSON.stringify(input)) as ClipGenerationInput;
  }
}
