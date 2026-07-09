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
      );
      clipResultIds.push(clipResultId);

      // 2. Fire avatar video generation via the selected provider
      try {
        await this.clipResultsService.patch(clipResultId, {
          status: 'extracting',
        });

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

        await this.clipResultsService.patch(clipResultId, {
          providerJobId: result.jobId,
          providerName: result.providerName,
        });

        providerJobIds.push(result.jobId);
        queuedClipCount += 1;

        this.logger.log(
          `${this.logContext} provider job fired for clip ${i + 1}/${highlights.length}`,
          { clipResultId, jobId: result.jobId, provider },
        );
      } catch (error: unknown) {
        this.logger.error(
          `${this.logContext} generation failed for clip ${i + 1}`,
          error,
        );

        await this.clipResultsService.patch(clipResultId, {
          providerName: provider,
          status: 'failed',
        });

        providerJobIds.push('');
      }
    }

    this.logger.log(`${this.logContext} generation batch complete`, {
      clipResultIds,
      projectId,
      queuedClipCount,
      successfulJobs: providerJobIds.filter(Boolean).length,
    });

    return { clipResultIds, providerJobIds, queuedClipCount };
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
      );
      clipResultIds.push(clipResultId);

      // 2. Dispatch the deterministic cut + caption for this highlight
      try {
        await this.clipResultsService.patch(clipResultId, {
          status: 'extracting',
        });

        const captionSrt = generateClipSrt(
          transcriptSegments,
          highlight.start_time,
          highlight.end_time,
        );

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

        await this.clipResultsService.patch(clipResultId, {
          captionSrt,
          providerJobId: dispatch.jobId,
          providerName: dispatch.providerName,
        });

        providerJobIds.push(dispatch.jobId);
        queuedClipCount += 1;

        this.logger.log(
          `${this.logContext} raw-cut job dispatched for clip ${i + 1}/${highlights.length}`,
          { clipResultId, jobId: dispatch.jobId },
        );
      } catch (error: unknown) {
        this.logger.error(
          `${this.logContext} raw-cut generation failed for clip ${i + 1}`,
          error,
        );

        await this.clipResultsService.patch(clipResultId, {
          providerName: RAW_CUT_PROVIDER_NAME,
          status: 'failed',
        });

        providerJobIds.push('');
      }
    }

    this.logger.log(`${this.logContext} raw-cut generation batch complete`, {
      clipResultIds,
      projectId,
      queuedClipCount,
      successfulJobs: providerJobIds.filter(Boolean).length,
    });

    return { clipResultIds, providerJobIds, queuedClipCount };
  }

  /**
   * Persist a ClipResult for a highlight in `pending` state and return its id.
   * Shared by both generation modes so the created record shape stays identical.
   */
  private async createPendingClipResult(
    highlight: ClipHighlight,
    index: number,
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<string> {
    const clipResult: ClipResultDocument = await this.clipResultsService.create(
      {
        clipType: highlight.clip_type,
        duration: highlight.end_time - highlight.start_time,
        endTime: highlight.end_time,
        index,
        organization: orgId,
        project: projectId,
        startTime: highlight.start_time,
        status: 'pending',
        summary: highlight.summary,
        tags: highlight.tags,
        title: highlight.title,
        user: userId,
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
