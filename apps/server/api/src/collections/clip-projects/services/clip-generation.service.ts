import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipLibraryLinkService } from '@api/collections/clip-projects/services/clip-library-link.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { CreateClipResultDto } from '@api/collections/clip-results/dto/create-clip-result.dto';
import { type ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { videoGenerationBriefSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type {
  ClipGenerationReference,
  ClipReferenceProvenance,
  ClipResultMode,
  SupportedAvatarVideoProviderName,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  buildClipGenerationWorkflowDefinition,
  CLIP_GENERATION_WORKFLOW_ID,
} from './clip-generation-workflow-definition';
import { generateClipSrt, type TranscriptSegment } from './clip-srt.util';
import {
  getRawCutTrimJobId,
  RAW_CUT_PROVIDER_NAME,
  RawCutClipService,
} from './raw-cut-clip.service';

/**
 * A single highlight as produced by the HighlightDetectorService in the clips
 * microservice. Only the fields consumed here are listed.
 */
export interface ClipHighlight {
  start_time: number;
  end_time: number;
  title: string;
  summary: string;
  virality_score: number;
  tags: string[];
  clip_type: string;
}

/**
 * Generation mode for a clip project batch. Aliased to the canonical
 * {@link ClipResultMode} so the batch discriminator and the persisted
 * clip-result `mode` column never diverge.
 * - `avatar`: fires an external avatar provider per highlight (existing behavior).
 * - `raw-cut`: deterministically cuts + captions the source footage per highlight.
 */
export type ClipGenerationMode = ClipResultMode;

export interface ClipGenerationInput {
  highlights: ClipHighlight[];
  projectId: string;
  orgId: string;
  userId: string;
  /** Defaults to `avatar` so existing callers are unaffected. */
  mode?: ClipGenerationMode;

  // Avatar-mode inputs (required only when mode === 'avatar').
  avatarId?: string;
  voiceId?: string;
  provider?: SupportedAvatarVideoProviderName;
  referenceImageUrl?: string;
  referenceProvenance?: ClipReferenceProvenance;
  transcriptText?: string;

  // Raw-cut-mode inputs (required only when mode === 'raw-cut').
  sourceVideoS3Key?: string;
  sourceVideoUrl?: string;
  transcriptSegments?: TranscriptSegment[];
  room?: string;
  runReferences?: readonly ClipGenerationReference[];
  /** Opt into hook-first approval for a multi-clip batch. */
  hookApprovalRequired?: boolean;
  /** Original batch position used by the one-highlight action node. */
  resultIndex?: number;
}

export interface ClipGenerationResult {
  awaitingHookApproval?: boolean;
  clipResultIds: string[];
  completedClipCount?: number;
  providerJobIds: string[];
  queuedClipCount: number;
}

export interface ClipHookReviewContext {
  attempt: number;
  feedback?: string;
  lastAction?: 'approve' | 'request_changes' | 'reject';
}

/**
 * Outcome of dispatching a single highlight. `jobId` is recorded on the batch
 * result; `patch` is applied to the clip-result after a successful dispatch
 * (mode-specific provider metadata, plus caption SRT for raw-cut).
 */
interface ClipDispatchOutcome {
  jobId: string;
  patch?: Record<string, unknown>;
  terminal?: {
    status: 'completed';
    videoUrl: string;
  };
}

/**
 * Configuration for the shared per-highlight generation loop. The only
 * per-mode variation is the {@link ClipDispatchOutcome} produced by `dispatch`
 * and the provider name recorded when a dispatch fails.
 */
interface GenerationLoopConfig {
  highlights: ClipHighlight[];
  mode: ClipGenerationMode;
  orgId: string;
  projectId: string;
  referenceProvenance?: ClipReferenceProvenance;
  resultIndex?: number;
  userId: string;
  runReferences: readonly ClipGenerationReference[];
  /** Provider name persisted on a clip-result when its dispatch throws. */
  failureProviderName: string;
  dispatch: (context: {
    highlight: ClipHighlight;
    clipResultId: string;
    index: number;
  }) => Promise<ClipDispatchOutcome>;
}

@Injectable()
export class ClipGenerationService implements OnModuleInit {
  private readonly logContext = 'ClipGenerationService';

  constructor(
    private readonly clipResultsService: ClipResultsService,
    private readonly avatarVideoService: AvatarVideoService,
    private readonly rawCutClipService: RawCutClipService,
    private readonly logger: LoggerService,
    @Optional()
    private readonly clipLibraryLinkService?: ClipLibraryLinkService,
    @Optional()
    private readonly clipProjectsService?: ClipProjectsService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  onModuleInit(): void {
    const runner = this.requireWorkflowRunner();
    runner.registerAction('clip.generation.generate-one', ({ input }) =>
      this.executeGenerateOne(input),
    );
    runner.registerWorkflow(buildClipGenerationWorkflowDefinition());
  }

  /**
   * Creates ClipResult records for each highlight and dispatches generation
   * jobs. Routes to the avatar provider (default) or the deterministic
   * raw-cut pipeline based on {@link ClipGenerationInput.mode}.
   */
  async generateClips(
    input: ClipGenerationInput,
    reviewContext: ClipHookReviewContext = { attempt: 1 },
  ): Promise<ClipGenerationResult> {
    if (input.highlights.length === 0) {
      throw new Error('Clip generation requires at least one highlight');
    }
    const request = this.toPersistedInput(input);
    const definition = buildClipGenerationWorkflowDefinition();
    const { execution } = await this.requireWorkflowRunner().startWorkflow({
      actionType: CLIP_GENERATION_WORKFLOW_ID,
      canonicalId: definition.canonicalId,
      inputValues: { request, reviewContext },
      metadata: {
        clipHookReviewAttempt: reviewContext.attempt,
        ...(reviewContext.feedback
          ? { clipHookReviewFeedback: reviewContext.feedback }
          : {}),
        ...(reviewContext.lastAction
          ? { clipHookReviewLastAction: reviewContext.lastAction }
          : {}),
        projectId: request.projectId,
      },
      organizationId: request.orgId,
      source: CLIP_GENERATION_WORKFLOW_ID,
      userId: request.userId,
    });

    if (execution.status === WorkflowExecutionStatus.FAILED) {
      throw new Error(execution.error ?? 'Clip generation workflow failed');
    }

    const hookReviewRequired = this.isHookReviewRequired(request);
    if (
      hookReviewRequired &&
      execution.status === WorkflowExecutionStatus.RUNNING
    ) {
      const result = this.collectForEachResults(execution.nodeResults, [
        'generate-hook',
      ]);
      return { ...result, awaitingHookApproval: true };
    }

    return this.collectForEachResults(execution.nodeResults, [
      'generate-hook',
      'generate-remaining',
    ]);
  }

  private async dispatchClips(
    input: ClipGenerationInput,
  ): Promise<ClipGenerationResult> {
    const mode: ClipGenerationMode = input.mode ?? 'avatar';

    if (mode === 'raw-cut') {
      return this.generateRawCutClips(input);
    }

    return this.generateAvatarClips(input);
  }

  /**
   * Avatar generation: one external provider job per highlight.
   */
  private async generateAvatarClips(
    input: ClipGenerationInput,
  ): Promise<ClipGenerationResult> {
    const {
      highlights,
      avatarId,
      voiceId,
      projectId,
      orgId,
      userId,
      provider = 'heygen',
      referenceImageUrl,
      runReferences = [],
    } = input;

    this.logger.log(
      `${this.logContext} generating ${highlights.length} clips`,
      {
        avatarId,
        orgId,
        projectId,
        provider,
        voiceId,
      },
    );

    const avatarProvider = this.avatarVideoService.getProvider(provider);
    const characterReferenceUrl = runReferences.find(
      (reference) => reference.role === 'character',
    )?.url;
    const effectiveReferenceImageUrl =
      referenceImageUrl ?? characterReferenceUrl;

    return this.runGenerationLoop({
      dispatch: async ({ clipResultId, highlight }) => {
        const scriptText = this.buildAvatarScript(highlight);
        let providerMetadataPersisted = false;

        const result = await avatarProvider.generateVideo({
          avatarId: avatarId ?? '',
          callbackId: clipResultId,
          onJobCreated: async (job) => {
            await this.clipResultsService.patch(
              clipResultId,
              {
                providerJobId: job.jobId,
                providerName: job.providerName,
              },
              [],
              orgId,
            );
            providerMetadataPersisted = true;
          },
          organizationId: orgId,
          ...(effectiveReferenceImageUrl
            ? { referenceImageUrl: effectiveReferenceImageUrl }
            : {}),
          script: scriptText,
          userId,
          voiceId: voiceId ?? '',
        });

        if (result.status === 'failed') {
          throw new Error(result.error || 'Provider returned failed status');
        }

        return {
          jobId: result.jobId,
          patch: providerMetadataPersisted
            ? undefined
            : {
                providerJobId: result.jobId,
                providerName: result.providerName,
              },
          ...(result.status === 'completed' && result.videoUrl
            ? {
                terminal: {
                  status: 'completed' as const,
                  videoUrl: result.videoUrl,
                },
              }
            : {}),
        };
      },
      failureProviderName: provider,
      highlights,
      mode: 'avatar',
      orgId,
      projectId,
      referenceProvenance: input.referenceProvenance,
      resultIndex: input.resultIndex,
      runReferences,
      userId,
    });
  }

  /**
   * Deterministic raw-cut generation: one trim + caption dispatch per
   * highlight, cutting the highlight window out of the original source video
   * and burning its highlight-relative captions. No avatar/voice inputs are
   * required. A per-highlight failure isolates to that clip-result; the batch
   * continues.
   */
  private async generateRawCutClips(
    input: ClipGenerationInput,
  ): Promise<ClipGenerationResult> {
    const {
      highlights,
      projectId,
      orgId,
      userId,
      sourceVideoS3Key,
      sourceVideoUrl,
      transcriptSegments = [],
      room,
    } = input;

    this.logger.log(
      `${this.logContext} generating ${highlights.length} raw-cut clips`,
      { orgId, projectId },
    );

    return this.runGenerationLoop({
      dispatch: async ({ clipResultId, highlight }) => {
        const captionSrt = generateClipSrt(
          transcriptSegments,
          highlight.start_time,
          highlight.end_time,
        );
        const providerJobId = getRawCutTrimJobId(clipResultId);

        await this.clipResultsService.patch(
          clipResultId,
          {
            captionSrt,
            providerJobId,
            providerName: RAW_CUT_PROVIDER_NAME,
            room,
            sourceVideoS3Key,
            sourceVideoUrl,
            userId,
          },
          [],
          orgId,
        );

        const dispatch = await this.rawCutClipService.dispatchClip({
          captionSrt,
          clipResultId,
          endTime: highlight.end_time,
          organizationId: orgId,
          room,
          sourceVideoS3Key,
          sourceVideoUrl,
          startTime: highlight.start_time,
          userId,
        });

        return {
          jobId: dispatch.jobId,
        };
      },
      failureProviderName: RAW_CUT_PROVIDER_NAME,
      highlights,
      mode: 'raw-cut',
      orgId,
      projectId,
      referenceProvenance: input.referenceProvenance,
      resultIndex: input.resultIndex,
      runReferences: input.runReferences ?? [],
      userId,
    });
  }

  /**
   * Shared per-highlight generation loop. Owns the invariant skeleton both
   * modes share — persist a pending clip-result, mark it extracting, dispatch,
   * persist the success metadata, and isolate a per-highlight failure so the
   * batch continues. The only per-mode variation is {@link GenerationLoopConfig.dispatch}
   * and the provider name recorded on a failed dispatch.
   */
  private async runGenerationLoop(
    config: GenerationLoopConfig,
  ): Promise<ClipGenerationResult> {
    const {
      dispatch,
      failureProviderName,
      highlights,
      mode,
      orgId,
      projectId,
      referenceProvenance,
      runReferences,
      userId,
    } = config;

    const clipResultIds: string[] = [];
    const providerJobIds: string[] = [];
    let queuedClipCount = 0;
    let completedClipCount = 0;

    for (let i = 0; i < highlights.length; i++) {
      const highlight = highlights[i];

      // 1. Persist the ClipResult in pending state
      const clipResultId = await this.createPendingClipResult(
        highlight,
        config.resultIndex ?? i,
        orgId,
        projectId,
        userId,
        referenceProvenance,
        mode,
        runReferences,
      );
      clipResultIds.push(clipResultId);

      // 2. Dispatch generation for this highlight via the mode-specific path
      try {
        await this.clipResultsService.patch(
          clipResultId,
          {
            providerName: failureProviderName,
            status: 'extracting',
          },
          [],
          orgId,
        );

        const { jobId, patch, terminal } = await dispatch({
          clipResultId,
          highlight,
          index: i,
        });

        if (patch) {
          await this.clipResultsService.patch(clipResultId, patch, [], orgId);
        }

        if (terminal) {
          const completed = await this.completeInlineProviderResult({
            clipResultId,
            organizationId: orgId,
            projectId,
            providerJobId: jobId,
            providerName: failureProviderName,
            videoUrl: terminal.videoUrl,
          });
          if (completed) {
            completedClipCount += 1;
          }
        }

        providerJobIds.push(jobId);
        queuedClipCount += 1;

        this.logger.log(
          `${this.logContext} ${mode} job dispatched for clip ${i + 1}/${highlights.length}`,
          { clipResultId, jobId },
        );
      } catch (error: unknown) {
        this.logger.error(
          `${this.logContext} ${mode} generation failed for clip ${i + 1}`,
          error,
        );

        await this.clipResultsService.patch(
          clipResultId,
          {
            providerName: failureProviderName,
            status: 'failed',
          },
          [],
          orgId,
        );

        providerJobIds.push('');
      }
    }

    this.logger.log(`${this.logContext} ${mode} generation batch complete`, {
      clipResultIds,
      projectId,
      queuedClipCount,
      successfulJobs: providerJobIds.filter(Boolean).length,
    });

    return {
      clipResultIds,
      ...(completedClipCount > 0 ? { completedClipCount } : {}),
      providerJobIds,
      queuedClipCount,
    };
  }

  private async completeInlineProviderResult(input: {
    clipResultId: string;
    organizationId: string;
    projectId: string;
    providerJobId: string;
    providerName: string;
    videoUrl: string;
  }): Promise<boolean> {
    const transitioned =
      await this.clipResultsService.transitionProviderTerminal({
        clipResultId: input.clipResultId,
        providerJobId: input.providerJobId,
        providerName: input.providerName,
        status: 'completed',
        videoUrl: input.videoUrl,
      });
    if (!transitioned) {
      return false;
    }

    await this.clipLibraryLinkService?.linkReadyClip({
      clipResultId: input.clipResultId,
      organizationId: input.organizationId,
    });
    await this.clipProjectsService?.reconcileTerminalState(
      input.projectId,
      input.organizationId,
    );
    return true;
  }

  /**
   * Persist a ClipResult for a highlight in `pending` state and return its id.
   * Shared by both generation modes so the created record shape stays identical;
   * `mode` is threaded through so the durable clip-result column reflects the
   * generation path instead of always persisting the `avatar` default.
   */
  private async createPendingClipResult(
    highlight: ClipHighlight,
    index: number,
    orgId: string,
    projectId: string,
    userId: string,
    referenceProvenance: ClipReferenceProvenance | undefined,
    mode: ClipGenerationMode,
    runReferences: readonly ClipGenerationReference[],
  ): Promise<string> {
    const generationBrief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: {
        objective: this.buildAvatarScript(highlight),
        requestedText: [],
        subjects: [],
      },
      mediaKind: 'video',
      output: { durationSeconds: highlight.end_time - highlight.start_time },
      provenance: runReferences.map((reference) => ({
        field: `references.${reference.assetId}`,
        source: 'reference' as const,
      })),
      references: runReferences.map(({ assetId, description, role }) => ({
        assetId,
        ...(description ? { description } : {}),
        role,
      })),
      version: 1,
    });
    const createDto: CreateClipResultDto & {
      generationBrief: typeof generationBrief;
    } = {
      clipType: highlight.clip_type,
      duration: highlight.end_time - highlight.start_time,
      endTime: highlight.end_time,
      index,
      generationBrief,
      mode,
      organizationId: orgId,
      projectId,
      startTime: highlight.start_time,
      status: 'pending',
      summary: highlight.summary,
      tags: highlight.tags,
      title: highlight.title,
      userId,
      viralityScore: highlight.virality_score,
    };
    const clipResult: ClipResultDocument = referenceProvenance
      ? await this.clipResultsService.createGenerated(
          createDto,
          referenceProvenance,
        )
      : await this.clipResultsService.create(createDto);

    return String((clipResult as Record<string, unknown>).id ?? clipResult.id);
  }

  /**
   * Build a concise, engaging avatar script from a highlight.
   */
  private buildAvatarScript(highlight: ClipHighlight): string {
    return `${highlight.title}. ${highlight.summary}`;
  }

  private async executeGenerateOne(
    actionInput: Record<string, unknown>,
  ): Promise<ClipGenerationResult> {
    const request = this.readGenerationInput(actionInput.request);
    const originalIndex = this.readNonNegativeInteger(
      actionInput.originalIndex,
      'originalIndex',
    );
    const highlight = request.highlights[originalIndex];
    if (!highlight) {
      throw new Error(
        `Clip generation action could not resolve highlight ${originalIndex}`,
      );
    }
    const result = await this.dispatchClips({
      ...request,
      highlights: [highlight],
      hookApprovalRequired: false,
      resultIndex: originalIndex,
    });
    if (result.queuedClipCount !== 1) {
      throw new Error(
        `Clip generation action ${originalIndex} failed before dispatch`,
      );
    }
    return result;
  }

  private collectForEachResults(
    nodeResults: Array<{ nodeId: string; output?: unknown }>,
    nodeIds: string[],
  ): ClipGenerationResult {
    const orderedResults = nodeResults
      .filter((nodeResult) => nodeIds.includes(nodeResult.nodeId))
      .flatMap((nodeResult) => {
        const output = this.readRecord(nodeResult.output);
        return Array.isArray(output.results)
          ? output.results.map((entry, index) => {
              const child = this.readRecord(this.readRecord(entry).result);
              return {
                index: this.readNonNegativeInteger(
                  child.originalIndex,
                  `${nodeResult.nodeId}.results[${index}].originalIndex`,
                ),
                result: this.readGenerationResult(
                  child,
                  `${nodeResult.nodeId}.results[${index}]`,
                ),
              };
            })
          : [];
      })
      .sort((left, right) => left.index - right.index);
    if (orderedResults.length === 0) {
      throw new Error('Clip generation workflow returned no child results');
    }
    const completedClipCount = orderedResults.reduce(
      (total, item) => total + (item.result.completedClipCount ?? 0),
      0,
    );
    return {
      clipResultIds: orderedResults.flatMap(
        (item) => item.result.clipResultIds,
      ),
      ...(completedClipCount > 0 ? { completedClipCount } : {}),
      providerJobIds: orderedResults.flatMap(
        (item) => item.result.providerJobIds,
      ),
      queuedClipCount: orderedResults.reduce(
        (total, item) => total + item.result.queuedClipCount,
        0,
      ),
    };
  }

  private readGenerationInput(value: unknown): ClipGenerationInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Clip generation action requires a request object');
    }
    const request = value as Partial<ClipGenerationInput>;
    if (
      !Array.isArray(request.highlights) ||
      typeof request.orgId !== 'string' ||
      typeof request.projectId !== 'string' ||
      typeof request.userId !== 'string'
    ) {
      throw new Error('Clip generation action received an invalid request');
    }
    return request as ClipGenerationInput;
  }

  private readGenerationResult(
    value: unknown,
    nodeId: string,
  ): ClipGenerationResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Workflow node ${nodeId} returned no clip result`);
    }
    const result = value as Partial<ClipGenerationResult>;
    if (
      !Array.isArray(result.clipResultIds) ||
      !Array.isArray(result.providerJobIds) ||
      typeof result.queuedClipCount !== 'number'
    ) {
      throw new Error(
        `Workflow node ${nodeId} returned an invalid clip result`,
      );
    }
    return result as ClipGenerationResult;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readNonNegativeInteger(value: unknown, field: string): number {
    if (!Number.isInteger(value) || Number(value) < 0) {
      throw new Error(`Clip generation action requires ${field}`);
    }
    return Number(value);
  }

  private isHookReviewRequired(input: ClipGenerationInput): boolean {
    return (
      (input.hookApprovalRequired ??
        ((input.mode ?? 'avatar') === 'avatar' &&
          input.highlights.length > 1)) &&
      input.highlights.length > 1
    );
  }

  private toPersistedInput(input: ClipGenerationInput): ClipGenerationInput {
    return JSON.parse(JSON.stringify(input)) as ClipGenerationInput;
  }

  private requireWorkflowRunner(): SystemWorkflowRunnerService {
    if (!this.moduleRef) {
      throw new Error('Workflow action runner is unavailable');
    }
    return this.moduleRef.get(SystemWorkflowRunnerService, {
      strict: false,
    });
  }
}
