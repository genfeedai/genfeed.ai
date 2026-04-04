import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import type { AvatarVideoProviderName } from '@api/services/avatar-video/avatar-video-provider.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

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

export interface ClipGenerationInput {
  highlights: ClipHighlight[];
  avatarId: string;
  voiceId: string;
  projectId: string;
  orgId: string;
  userId: string;
  provider?: AvatarVideoProviderName;
  transcriptText?: string;
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
    private readonly logger: LoggerService,
  ) {}

  /**
   * Creates ClipResult records for each highlight and dispatches avatar video
   * generation jobs via the configured provider (defaults to HeyGen).
   */
  async generateClips(
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
      const clipResult: ClipResultDocument =
        await this.clipResultsService.create({
          clipType: highlight.clip_type,
          duration: highlight.end_time - highlight.start_time,
          endTime: highlight.end_time,
          index: i,
          organization: new Types.ObjectId(orgId),
          project: new Types.ObjectId(projectId),
          startTime: highlight.start_time,
          status: 'pending',
          summary: highlight.summary,
          tags: highlight.tags,
          title: highlight.title,
          user: new Types.ObjectId(userId),
          viralityScore: highlight.virality_score,
        });

      const clipResultId = String(clipResult._id);
      clipResultIds.push(clipResultId);

      // 2. Fire avatar video generation via the selected provider
      try {
        await this.clipResultsService.patch(clipResultId, {
          status: 'extracting',
        });

        const scriptText = this.buildAvatarScript(highlight);

        const result = await avatarProvider.generateVideo({
          avatarId,
          callbackId: clipResultId,
          organizationId: orgId,
          script: scriptText,
          userId,
          voiceId,
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
   * Build a concise, engaging avatar script from a highlight.
   */
  private buildAvatarScript(highlight: ClipHighlight): string {
    return `${highlight.title}. ${highlight.summary}`;
  }
}
