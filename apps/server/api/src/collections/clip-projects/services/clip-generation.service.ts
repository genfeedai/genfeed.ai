import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipLibraryLinkService } from '@api/collections/clip-projects/services/clip-library-link.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { CreateClipResultDto } from '@api/collections/clip-results/dto/create-clip-result.dto';
import { type ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import { ClipOrchestratorService } from '@api/services/clip-orchestrator/clip-orchestrator.service';
import { ClipRunState } from '@api/services/clip-orchestrator/clip-run-state.enum';
import {
  type GenerationBriefReference,
  videoGenerationBriefSchema,
} from '@api-types/contracts/generation-brief.contract';
import type {
  ClipReferenceProvenance,
  ClipResultMode,
} from '@genfeedai/interfaces';
import type { SupportedAvatarVideoProviderName } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
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
  runReferences?: readonly ClipRunGenerationReference[];
  /** Opt into hook-first approval for a multi-clip batch. */
  hookApprovalRequired?: boolean;
}

export type ClipRunGenerationReference = GenerationBriefReference & {
  url: string;
};

export interface ClipGenerationResult {
  awaitingHookApproval?: boolean;
  clipResultIds: string[];
  completedClipCount?: number;
  providerJobIds: string[];
  queuedClipCount: number;
}

export interface HookClipApprovalPlan {
  attempt: number;
  hookClipResultId: string;
  hookInput: ClipGenerationInput;
  phase: 'generating_hook' | 'resuming' | 'approved' | 'rejected' | 'failed';
  remainingInput: ClipGenerationInput;
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
  userId: string;
  runReferences: readonly ClipRunGenerationReference[];
  /** Provider name persisted on a clip-result when its dispatch throws. */
  failureProviderName: string;
  dispatch: (context: {
    highlight: ClipHighlight;
    clipResultId: string;
    index: number;
  }) => Promise<ClipDispatchOutcome>;
}

@Injectable()
export class ClipGenerationService {
  private readonly logContext = 'ClipGenerationService';

  constructor(
    private readonly clipResultsService: ClipResultsService,
    private readonly avatarVideoService: AvatarVideoService,
    private readonly rawCutClipService: RawCutClipService,
    private readonly logger: LoggerService,
    @Optional()
    private readonly clipOrchestrator?: ClipOrchestratorService,
    @Optional()
    private readonly clipLibraryLinkService?: ClipLibraryLinkService,
    @Optional()
    private readonly clipProjectsService?: ClipProjectsService,
  ) {}

  /**
   * Creates ClipResult records for each highlight and dispatches generation
   * jobs. Routes to the avatar provider (default) or the deterministic
   * raw-cut pipeline based on {@link ClipGenerationInput.mode}.
   */
  async generateClips(
    input: ClipGenerationInput,
  ): Promise<ClipGenerationResult> {
    const mode: ClipGenerationMode = input.mode ?? 'avatar';
    const hookApprovalRequired =
      input.hookApprovalRequired ??
      (mode === 'avatar' && input.highlights.length > 1);
    if (hookApprovalRequired && input.highlights.length > 1) {
      return this.generateHookFirst(input);
    }

    return this.dispatchClips(input);
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

  private async generateHookFirst(
    input: ClipGenerationInput,
  ): Promise<ClipGenerationResult> {
    if (!this.clipOrchestrator) {
      throw new Error('Clip orchestrator is required for hook approval');
    }

    const hookIndex = input.highlights.findIndex(
      (highlight) => highlight.clip_type.toLowerCase() === 'hook',
    );
    const resolvedHookIndex = hookIndex >= 0 ? hookIndex : 0;
    const hook = input.highlights[resolvedHookIndex];
    if (!hook) {
      throw new Error('Hook approval requires at least one highlight');
    }
    const remainingHighlights = input.highlights.filter(
      (_, index) => index !== resolvedHookIndex,
    );
    const immutableReferences = Object.freeze(
      (input.runReferences ?? []).map((reference) =>
        Object.freeze({ ...reference }),
      ),
    );
    const hookInput: ClipGenerationInput = {
      ...input,
      highlights: [hook],
      hookApprovalRequired: false,
      runReferences: immutableReferences,
    };
    const remainingInput: ClipGenerationInput = {
      ...input,
      highlights: remainingHighlights,
      hookApprovalRequired: false,
      runReferences: immutableReferences,
    };
    const run = await this.clipOrchestrator.startRun({
      confirmationRequired: true,
      organizationId: input.orgId,
      projectId: input.projectId,
      runReferences: immutableReferences,
      userId: input.userId,
    });
    await this.clipOrchestrator.transition(run.id, ClipRunState.Generating);

    const result = await this.dispatchClips(hookInput);
    const hookClipResultId = result.clipResultIds[0];
    if (!hookClipResultId || result.queuedClipCount === 0) {
      await this.clipOrchestrator.reject(
        run.id,
        'Hook generation failed before a provider job was queued.',
      );
      return result;
    }

    const hookApproval: HookClipApprovalPlan = {
      attempt: 1,
      hookClipResultId,
      hookInput,
      phase: 'generating_hook',
      remainingInput,
    };
    await this.clipOrchestrator.updateMetadata(run.id, { hookApproval });
    if (result.completedClipCount) {
      await this.clipProjectsService?.patch(
        input.projectId,
        { error: null, status: 'generating' },
        [],
        input.orgId,
      );
    }
    return { ...result, awaitingHookApproval: true };
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
        i,
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
          await this.completeInlineProviderResult({
            clipResultId,
            organizationId: orgId,
            projectId,
            providerJobId: jobId,
            providerName: failureProviderName,
            videoUrl: terminal.videoUrl,
          });
          completedClipCount += 1;
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
  }): Promise<void> {
    const transitioned =
      await this.clipResultsService.transitionProviderTerminal({
        clipResultId: input.clipResultId,
        providerJobId: input.providerJobId,
        providerName: input.providerName,
        status: 'completed',
        videoUrl: input.videoUrl,
      });
    if (!transitioned) {
      return;
    }

    await this.clipLibraryLinkService?.linkReadyClip({
      clipResultId: input.clipResultId,
      organizationId: input.organizationId,
    });
    await this.clipProjectsService?.reconcileTerminalState(
      input.projectId,
      input.organizationId,
    );
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
    runReferences: readonly ClipRunGenerationReference[],
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
}
