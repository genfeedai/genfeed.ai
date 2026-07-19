import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { CreateClipResultDto } from '@api/collections/clip-results/dto/create-clip-result.dto';
import { type ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import type { ClipResultMode } from '@genfeedai/interfaces';
import type { SupportedAvatarVideoProviderName } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
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
  transcriptText?: string;

  // Raw-cut-mode inputs (required only when mode === 'raw-cut').
  sourceVideoS3Key?: string;
  sourceVideoUrl?: string;
  transcriptSegments?: TranscriptSegment[];
  authProviderUserId?: string;
  room?: string;
}

export interface ClipGenerationResult {
  clipResultIds: string[];
  providerJobIds: string[];
  queuedClipCount: number;
}

/**
 * Outcome of dispatching a single highlight. `jobId` is recorded on the batch
 * result; `patch` is applied to the clip-result after a successful dispatch
 * (mode-specific provider metadata, plus caption SRT for raw-cut).
 */
interface ClipDispatchOutcome {
  jobId: string;
  patch?: Record<string, unknown>;
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
  userId: string;
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

    return this.runGenerationLoop({
      dispatch: async ({ clipResultId, highlight }) => {
        const scriptText = this.buildAvatarScript(highlight);

        const result = await avatarProvider.generateVideo({
          avatarId: avatarId as string,
          callbackId: clipResultId,
          organizationId: orgId,
          script: scriptText,
          userId,
          voiceId: voiceId as string,
        });

        if (result.status === 'failed') {
          throw new Error(result.error || 'Provider returned failed status');
        }

        return {
          jobId: result.jobId,
          patch: {
            providerJobId: result.jobId,
            providerName: result.providerName,
          },
        };
      },
      failureProviderName: provider,
      highlights,
      mode: 'avatar',
      orgId,
      projectId,
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
      authProviderUserId,
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

        await this.clipResultsService.patch(clipResultId, {
          authProviderUserId,
          captionSrt,
          providerJobId,
          providerName: RAW_CUT_PROVIDER_NAME,
          room,
          sourceVideoS3Key,
          sourceVideoUrl,
          userId,
        });

        const dispatch = await this.rawCutClipService.dispatchClip({
          authProviderUserId,
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
      userId,
    } = config;

    const clipResultIds: string[] = [];
    const providerJobIds: string[] = [];
    let queuedClipCount = 0;

    for (let i = 0; i < highlights.length; i++) {
      const highlight = highlights[i];

      // 1. Persist the ClipResult in pending state
      const clipResultId = await this.createPendingClipResult(
        highlight,
        i,
        orgId,
        projectId,
        userId,
        mode,
      );
      clipResultIds.push(clipResultId);

      // 2. Dispatch generation for this highlight via the mode-specific path
      try {
        await this.clipResultsService.patch(clipResultId, {
          status: 'extracting',
        });

        const { jobId, patch } = await dispatch({
          clipResultId,
          highlight,
          index: i,
        });

        if (patch) {
          await this.clipResultsService.patch(clipResultId, patch);
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

        await this.clipResultsService.patch(clipResultId, {
          providerName: failureProviderName,
          status: 'failed',
        });

        providerJobIds.push('');
      }
    }

    this.logger.log(`${this.logContext} ${mode} generation batch complete`, {
      clipResultIds,
      projectId,
      queuedClipCount,
      successfulJobs: providerJobIds.filter(Boolean).length,
    });

    return { clipResultIds, providerJobIds, queuedClipCount };
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
    mode: ClipGenerationMode,
  ): Promise<string> {
    const clipResult: ClipResultDocument = await this.clipResultsService.create(
      {
        clipType: highlight.clip_type,
        duration: highlight.end_time - highlight.start_time,
        endTime: highlight.end_time,
        index,
        mode,
        organization: orgId,
        project: projectId,
        startTime: highlight.start_time,
        status: 'pending',
        summary: highlight.summary,
        tags: highlight.tags,
        title: highlight.title,
        userId,
        viralityScore: highlight.virality_score,
      } as unknown as CreateClipResultDto,
    );

    return String((clipResult as Record<string, unknown>).id ?? clipResult.id);
  }

  /**
   * Build a concise, engaging avatar script from a highlight.
   */
  private buildAvatarScript(highlight: ClipHighlight): string {
    return `${highlight.title}. ${highlight.summary}`;
  }
}
