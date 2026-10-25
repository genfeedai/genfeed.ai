import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { ClipperAvatarBillingService } from '@api/collections/clipper-projects/services/clipper-avatar-billing.service';
import { ClipperLibraryLinkService } from '@api/collections/clipper-projects/services/clipper-library-link.service';
import { assertClipperWorkflowActor } from '@api/collections/clipper-projects/services/clipper-workflow-actor.util';
import { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import type { CreateClipperResultDto } from '@api/collections/clipper-results/dto/create-clipper-result.dto';
import { type ClipperResultDocument } from '@api/collections/clipper-results/schemas/clipper-result.schema';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { videoGenerationBriefSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type {
  ClipperGenerationReference,
  ClipperReferenceProvenance,
  ClipperResultMode,
  HeyGenAvatarRef,
  IBrandAgentConfig,
  SupportedAvatarVideoProviderName,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { generateClipSrt, type TranscriptSegment } from './clip-srt.util';
import {
  buildClipperGenerationWorkflowDefinition,
  CLIPPER_GENERATION_WORKFLOW_ID,
} from './clipper-generation-workflow-definition';
import {
  getRawCutTrimJobId,
  RAW_CUT_PROVIDER_NAME,
  RawCutClipService,
} from './raw-cut-clip.service';

/**
 * A single highlight as produced by the HighlightDetectorService in the clips
 * microservice. Only the fields consumed here are listed.
 */
export interface ClipperHighlight {
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
 * {@link ClipperResultMode} so the batch discriminator and the persisted
 * clipper-result `mode` column never diverge.
 * - `avatar`: fires an external avatar provider per highlight (existing behavior).
 * - `raw-cut`: deterministically cuts + captions the source footage per highlight.
 */
export type ClipperGenerationMode = ClipperResultMode;

export interface ClipperGenerationInput {
  highlights: ClipperHighlight[];
  projectId: string;
  orgId: string;
  userId: string;
  /** Defaults to `avatar` so existing callers are unaffected. */
  mode?: ClipperGenerationMode;

  // Avatar-mode inputs (required only when mode === 'avatar').
  avatarRef?: HeyGenAvatarRef;
  voiceRef?: NonNullable<IBrandAgentConfig['defaultVoiceRef']>;
  avatarId?: string;
  voiceId?: string;
  provider?: SupportedAvatarVideoProviderName;
  referenceImageUrl?: string;
  referenceProvenance?: ClipperReferenceProvenance;
  transcriptText?: string;

  // Raw-cut-mode inputs (required only when mode === 'raw-cut').
  sourceVideoS3Key?: string;
  sourceVideoUrl?: string;
  transcriptSegments?: TranscriptSegment[];
  room?: string;
  runReferences?: readonly ClipperGenerationReference[];
  /** Opt into hook-first approval for a multi-clip batch. */
  hookApprovalRequired?: boolean;
  /** Original batch position used by the one-highlight action node. */
  resultIndex?: number;
}

export interface ClipperGenerationResult {
  awaitingHookApproval?: boolean;
  clipperResultIds: string[];
  completedClipCount?: number;
  providerJobIds: string[];
  queuedClipCount: number;
}

export interface ClipperHookReviewContext {
  attempt: number;
  feedback?: string;
  lastAction?: 'approve' | 'request_changes' | 'reject';
}

/**
 * Outcome of dispatching a single highlight. `jobId` is recorded on the batch
 * result; `patch` is applied to the clipper-result after a successful dispatch
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
  highlights: ClipperHighlight[];
  mode: ClipperGenerationMode;
  orgId: string;
  projectId: string;
  referenceProvenance?: ClipperReferenceProvenance;
  resultIndex?: number;
  userId: string;
  runReferences: readonly ClipperGenerationReference[];
  /** Provider name persisted on a clipper-result when its dispatch throws. */
  failureProviderName: string;
  dispatch: (context: {
    highlight: ClipperHighlight;
    clipperResultId: string;
    index: number;
  }) => Promise<ClipDispatchOutcome>;
}

@Injectable()
export class ClipperGenerationService implements OnModuleInit {
  private readonly logContext = 'ClipperGenerationService';

  constructor(
    private readonly clipperResultsService: ClipperResultsService,
    private readonly avatarVideoService: AvatarVideoService,
    private readonly rawCutClipService: RawCutClipService,
    private readonly logger: LoggerService,
    private readonly clipperAvatarBilling: ClipperAvatarBillingService,
    @Optional()
    private readonly clipperLibraryLinkService?: ClipperLibraryLinkService,
    @Optional()
    private readonly clipperProjectsService?: ClipperProjectsService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  onModuleInit(): void {
    const runner = this.requireWorkflowRunner();
    runner.registerAction('clipper.generation.generate-one', (request) =>
      this.executeGenerateOne(request),
    );
    runner.registerWorkflow(buildClipperGenerationWorkflowDefinition());
  }

  /**
   * Creates ClipperResult records for each highlight and dispatches generation
   * jobs. Routes to the avatar provider (default) or the deterministic
   * raw-cut pipeline based on {@link ClipperGenerationInput.mode}.
   */
  async generateClips(
    input: ClipperGenerationInput,
    reviewContext: ClipperHookReviewContext = { attempt: 1 },
  ): Promise<ClipperGenerationResult> {
    if (input.highlights.length === 0) {
      throw new Error('Clip generation requires at least one highlight');
    }
    const request = this.toPersistedInput(input);
    const definition = buildClipperGenerationWorkflowDefinition();
    const { execution } = await this.requireWorkflowRunner().startWorkflow({
      actionType: CLIPPER_GENERATION_WORKFLOW_ID,
      canonicalId: definition.canonicalId,
      inputValues: { request, reviewContext },
      metadata: {
        clipperHookReviewAttempt: reviewContext.attempt,
        ...(reviewContext.feedback
          ? { clipperHookReviewFeedback: reviewContext.feedback }
          : {}),
        ...(reviewContext.lastAction
          ? { clipperHookReviewLastAction: reviewContext.lastAction }
          : {}),
        projectId: request.projectId,
      },
      organizationId: request.orgId,
      source: CLIPPER_GENERATION_WORKFLOW_ID,
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
    input: ClipperGenerationInput,
  ): Promise<ClipperGenerationResult> {
    const mode: ClipperGenerationMode = input.mode ?? 'avatar';

    if (mode === 'raw-cut') {
      return this.generateRawCutClips(input);
    }

    return this.generateAvatarClips(input);
  }

  /**
   * Avatar generation: one external provider job per highlight.
   */
  private async generateAvatarClips(
    input: ClipperGenerationInput,
  ): Promise<ClipperGenerationResult> {
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
    const effectiveReferenceImageUrl = input.avatarRef
      ? undefined
      : (referenceImageUrl ?? characterReferenceUrl);

    return this.runGenerationLoop({
      dispatch: async ({ clipperResultId, highlight }) => {
        const scriptText = this.buildAvatarScript(highlight);
        let providerMetadataPersisted = false;

        const result = await avatarProvider.generateVideo({
          avatarId: avatarId ?? '',
          avatarRef: input.avatarRef,
          voiceRef: input.voiceRef,
          callbackId: clipperResultId,
          fundSubmission: (plan) =>
            this.clipperAvatarBilling.fund({
              clipperResultId,
              organizationId: orgId,
              plan,
              script: scriptText,
              userId,
            }),
          onJobCreated: async (job) => {
            await this.clipperResultsService.patch(
              clipperResultId,
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
   * required. A per-highlight failure isolates to that clipper-result; the batch
   * continues.
   */
  private async generateRawCutClips(
    input: ClipperGenerationInput,
  ): Promise<ClipperGenerationResult> {
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
      dispatch: async ({ clipperResultId, highlight }) => {
        const captionSrt = generateClipSrt(
          transcriptSegments,
          highlight.start_time,
          highlight.end_time,
        );
        const providerJobId = getRawCutTrimJobId(clipperResultId);

        await this.clipperResultsService.patch(
          clipperResultId,
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
          clipperResultId,
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
   * modes share — persist a pending clipper-result, mark it extracting, dispatch,
   * persist the success metadata, and isolate a per-highlight failure so the
   * batch continues. The only per-mode variation is {@link GenerationLoopConfig.dispatch}
   * and the provider name recorded on a failed dispatch.
   */
  private async runGenerationLoop(
    config: GenerationLoopConfig,
  ): Promise<ClipperGenerationResult> {
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

    const clipperResultIds: string[] = [];
    const providerJobIds: string[] = [];
    let queuedClipCount = 0;
    let completedClipCount = 0;

    for (let i = 0; i < highlights.length; i++) {
      const highlight = highlights[i];

      // 1. Persist the ClipperResult in pending state
      const clipperResultId = await this.createPendingClipperResult(
        highlight,
        config.resultIndex ?? i,
        orgId,
        projectId,
        userId,
        referenceProvenance,
        mode,
        runReferences,
      );
      clipperResultIds.push(clipperResultId);

      // 2. Dispatch generation for this highlight via the mode-specific path
      try {
        await this.clipperResultsService.patch(
          clipperResultId,
          {
            providerName: failureProviderName,
            status: 'extracting',
          },
          [],
          orgId,
        );

        const { jobId, patch, terminal } = await dispatch({
          clipperResultId,
          highlight,
          index: i,
        });

        if (patch) {
          await this.clipperResultsService.patch(
            clipperResultId,
            patch,
            [],
            orgId,
          );
        }

        if (terminal) {
          const completed = await this.completeInlineProviderResult({
            clipperResultId,
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
          { clipperResultId, jobId },
        );
      } catch (error: unknown) {
        this.logger.error(
          `${this.logContext} ${mode} generation failed for clip ${i + 1}`,
          error,
        );

        await this.clipperResultsService.patch(
          clipperResultId,
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
      clipperResultIds,
      projectId,
      queuedClipCount,
      successfulJobs: providerJobIds.filter(Boolean).length,
    });

    return {
      clipperResultIds,
      ...(completedClipCount > 0 ? { completedClipCount } : {}),
      providerJobIds,
      queuedClipCount,
    };
  }

  private async completeInlineProviderResult(input: {
    clipperResultId: string;
    organizationId: string;
    projectId: string;
    providerJobId: string;
    providerName: string;
    videoUrl: string;
  }): Promise<boolean> {
    const transitioned =
      await this.clipperResultsService.transitionProviderTerminal({
        clipperResultId: input.clipperResultId,
        providerJobId: input.providerJobId,
        providerName: input.providerName,
        status: 'completed',
        videoUrl: input.videoUrl,
      });
    if (!transitioned) {
      return false;
    }

    await this.clipperLibraryLinkService?.linkReadyClip({
      clipperResultId: input.clipperResultId,
      organizationId: input.organizationId,
    });
    await this.clipperProjectsService?.reconcileTerminalState(
      input.projectId,
      input.organizationId,
    );
    return true;
  }

  /**
   * Persist a ClipperResult for a highlight in `pending` state and return its id.
   * Shared by both generation modes so the created record shape stays identical;
   * `mode` is threaded through so the durable clipper-result column reflects the
   * generation path instead of always persisting the `avatar` default.
   */
  private async createPendingClipperResult(
    highlight: ClipperHighlight,
    index: number,
    orgId: string,
    projectId: string,
    userId: string,
    referenceProvenance: ClipperReferenceProvenance | undefined,
    mode: ClipperGenerationMode,
    runReferences: readonly ClipperGenerationReference[],
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
    const createDto: CreateClipperResultDto & {
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
    const clipperResult: ClipperResultDocument = referenceProvenance
      ? await this.clipperResultsService.createGenerated(
          createDto,
          referenceProvenance,
        )
      : await this.clipperResultsService.create(createDto);

    return String(
      (clipperResult as Record<string, unknown>).id ?? clipperResult.id,
    );
  }

  /**
   * Build a concise, engaging avatar script from a highlight.
   */
  private buildAvatarScript(highlight: ClipperHighlight): string {
    return `${highlight.title}. ${highlight.summary}`;
  }

  private async executeGenerateOne(
    action: SystemWorkflowActionRequest,
  ): Promise<ClipperGenerationResult> {
    const actionInput = action.input;
    const request = this.readGenerationInput(actionInput.request);
    assertClipperWorkflowActor(action, request);
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
  ): ClipperGenerationResult {
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
      clipperResultIds: orderedResults.flatMap(
        (item) => item.result.clipperResultIds,
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

  private readGenerationInput(value: unknown): ClipperGenerationInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Clip generation action requires a request object');
    }
    const request = value as Partial<ClipperGenerationInput>;
    if (
      !Array.isArray(request.highlights) ||
      typeof request.orgId !== 'string' ||
      typeof request.projectId !== 'string' ||
      typeof request.userId !== 'string'
    ) {
      throw new Error('Clip generation action received an invalid request');
    }
    return request as ClipperGenerationInput;
  }

  private readGenerationResult(
    value: unknown,
    nodeId: string,
  ): ClipperGenerationResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Workflow node ${nodeId} returned no clip result`);
    }
    const result = value as Partial<ClipperGenerationResult>;
    if (
      !Array.isArray(result.clipperResultIds) ||
      !Array.isArray(result.providerJobIds) ||
      typeof result.queuedClipCount !== 'number'
    ) {
      throw new Error(
        `Workflow node ${nodeId} returned an invalid clip result`,
      );
    }
    return result as ClipperGenerationResult;
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

  private isHookReviewRequired(input: ClipperGenerationInput): boolean {
    return (
      (input.hookApprovalRequired ??
        ((input.mode ?? 'avatar') === 'avatar' &&
          input.highlights.length > 1)) &&
      input.highlights.length > 1
    );
  }

  private toPersistedInput(
    input: ClipperGenerationInput,
  ): ClipperGenerationInput {
    return JSON.parse(JSON.stringify(input)) as ClipperGenerationInput;
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
