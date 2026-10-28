import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import {
  isTranscriptSegment,
  type TranscriptSegment,
} from '@api/collections/clipper-projects/services/clip-srt.util';
import {
  planClipEdit,
  selectTranscriptWindow,
  summarizeClip,
} from '@api/collections/clipper-projects/services/clipper-clip-edit.util';
import { ClipperGenerationService } from '@api/collections/clipper-projects/services/clipper-generation.service';
import { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type {
  IClipperClipContext,
  IClipperClipEditRequest,
  IClipperClipEditResult,
  IClipperProjectClips,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

function readTranscriptSegments(value: unknown): TranscriptSegment[] {
  return Array.isArray(value) ? value.filter(isTranscriptSegment) : [];
}

/**
 * Re-cuts a finished raw-cut clip to a new window of its source video. The
 * original clip is kept untouched; the edit is queued as a new clip result on
 * the same project and goes through the same cut, reframe, caption and
 * validation steps as any raw-cut clip, with captions rebuilt for the window.
 */
@Injectable()
export class ClipperClipEditService {
  private readonly logContext = 'ClipperClipEditService';

  constructor(
    private readonly clipperProjectsService: ClipperProjectsService,
    private readonly clipperResultsService: ClipperResultsService,
    private readonly clipperGenerationService: ClipperGenerationService,
    private readonly logger: LoggerService,
  ) {}

  /** One clip plus the transcript around it, for choosing a new window. */
  async getClipContext(
    organizationId: string,
    clipperResultId: string,
  ): Promise<IClipperClipContext> {
    const clip = await this.clipperResultsService.findOne({
      id: clipperResultId,
      isDeleted: false,
      organizationId,
    });
    if (!clip) {
      throw new NotFoundException('ClipperResult', clipperResultId);
    }
    const projectId = String(clip.projectId);
    const project = await this.clipperProjectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId,
    });
    if (!project) {
      throw new NotFoundException('ClipperProject', projectId);
    }

    const summary = summarizeClip(clip);
    const transcript =
      summary.startTime !== null && summary.endTime !== null
        ? selectTranscriptWindow(
            readTranscriptSegments(project.transcriptSegments),
            summary.startTime,
            summary.endTime,
          )
        : [];
    return {
      clip: summary,
      projectId,
      sourceDurationSeconds: project.source?.durationSeconds ?? null,
      transcript,
    };
  }

  /** The clips of a project, so an agent can find the one the user means. */
  async listProjectClips(
    organizationId: string,
    projectId: string,
  ): Promise<IClipperProjectClips> {
    const project = await this.clipperProjectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId,
    });
    if (!project) {
      throw new NotFoundException('ClipperProject', projectId);
    }
    const results = await this.clipperResultsService.findByProject(
      projectId,
      organizationId,
    );
    return {
      clips: results.map((result) => summarizeClip(result)),
      projectId,
    };
  }

  /** Undo the 'generating' flip when no edit was queued; the failure itself is reported. */
  private async restoreProjectStatus(
    projectId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.clipperProjectsService.reconcileTerminalState(
        projectId,
        organizationId,
      );
    } catch (error: unknown) {
      this.logger.error(`${this.logContext} could not restore project status`, {
        error: error instanceof Error ? error.message : String(error),
        projectId,
      });
    }
  }

  async editClip(
    organizationId: string,
    userId: string,
    request: IClipperClipEditRequest,
  ): Promise<IClipperClipEditResult> {
    const original = await this.clipperResultsService.findOne({
      id: request.clipperResultId,
      isDeleted: false,
      organizationId,
    });
    if (!original) {
      throw new NotFoundException('ClipperResult', request.clipperResultId);
    }

    const projectId = String(original.projectId);
    const project = await this.clipperProjectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId,
    });
    if (!project) {
      throw new NotFoundException('ClipperProject', projectId);
    }

    const sourceVideoS3Key =
      project.sourceVideoS3Key ?? original.sourceVideoS3Key ?? undefined;
    const sourceVideoUrl =
      project.sourceVideoUrl ?? original.sourceVideoUrl ?? undefined;
    if (!sourceVideoS3Key && !sourceVideoUrl) {
      throw new BadRequestException(
        'The source video of this clip is no longer available, so it cannot be re-cut.',
      );
    }

    const transcriptSegments = readTranscriptSegments(
      project.transcriptSegments,
    );
    const plan = planClipEdit({
      request,
      sourceDurationSeconds: project.source?.durationSeconds,
      subject: original,
      transcriptSegments,
    });

    await this.clipperProjectsService.patch(
      projectId,
      { error: null, status: 'generating', terminalAt: null },
      [],
      organizationId,
    );

    let generated: Awaited<
      ReturnType<ClipperGenerationService['generateClips']>
    >;
    try {
      generated = await this.clipperGenerationService.generateClips({
        highlights: [
          {
            clip_type:
              typeof original.clipType === 'string'
                ? original.clipType
                : 'edit',
            end_time: plan.endTime,
            start_time: plan.startTime,
            summary:
              typeof original.summary === 'string' ? original.summary : '',
            tags: Array.isArray(original.tags)
              ? original.tags.filter(
                  (tag): tag is string => typeof tag === 'string',
                )
              : [],
            title: plan.title,
            virality_score:
              typeof original.viralityScore === 'number'
                ? original.viralityScore
                : 0,
          },
        ],
        hookApprovalRequired: false,
        mode: 'raw-cut',
        orgId: organizationId,
        projectId,
        resultIndex: typeof original.index === 'number' ? original.index : 0,
        sourceVideoS3Key,
        sourceVideoUrl,
        transcriptSegments,
        userId,
      });
    } catch (error: unknown) {
      await this.restoreProjectStatus(projectId, organizationId);
      throw error;
    }

    const [editedId] = generated.clipperResultIds;
    if (!editedId || generated.queuedClipCount === 0) {
      await this.restoreProjectStatus(projectId, organizationId);
      throw new BadRequestException(
        'The edit could not be queued. The original clip is unchanged.',
      );
    }

    await this.clipperResultsService.patch(
      editedId,
      { editedFromClipperResultId: request.clipperResultId },
      [],
      organizationId,
    );

    this.logger.log(`${this.logContext} edit queued`, {
      clipperResultId: editedId,
      editedFromClipperResultId: request.clipperResultId,
      organizationId,
      projectId,
    });

    return {
      captionCueCount: plan.captionCueCount,
      clipperResultId: editedId,
      duration: plan.duration,
      editedFromClipperResultId: request.clipperResultId,
      endTime: plan.endTime,
      projectId,
      startTime: plan.startTime,
      status: 'extracting',
    };
  }
}
