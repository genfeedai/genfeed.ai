import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { GenerateClipsDto } from '@api/collections/clipper-projects/dto/generate-clips.dto';
import { isTranscriptSegment } from '@api/collections/clipper-projects/services/clip-srt.util';
import {
  type ClipperGenerationResult as ClipperGenerationJobResult,
  ClipperGenerationService,
} from '@api/collections/clipper-projects/services/clipper-generation.service';
import { ClipperGenerationRequestService } from '@api/collections/clipper-projects/services/clipper-generation-request.service';
import { ClipperIdentityResolutionService } from '@api/collections/clipper-projects/services/clipper-identity-resolution.service';
import { clipperGenerationIdentity } from '@api/collections/clipper-projects/services/clipper-identity-resolution.util';
import type { ResolvedClipperReference } from '@api/collections/clipper-projects/services/clipper-reference-generation.util';
import { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ClipperReferenceApplication } from '@genfeedai/contracts/interfaces';
import { DEFAULT_CLIP_RESULT_MODE } from '@genfeedai/contracts/interfaces';
import {
  type ClipperGenerationResult,
  serializeClipperGenerationResult,
} from '@genfeedai/serializers';
import { readNonEmptyStringOrNull } from '@genfeedai/utils/data/extract.util';
import { BadRequestException, Injectable } from '@nestjs/common';

function toDispatchedStatus(
  result: ClipperGenerationJobResult,
): 'completed' | 'failed' | 'generating' {
  if (
    result.queuedClipCount > 0 &&
    result.completedClipCount === result.queuedClipCount &&
    !result.awaitingHookApproval
  ) {
    return 'completed';
  }

  return result.queuedClipCount > 0 ? 'generating' : 'failed';
}

@Injectable()
export class ClipperGenerationDispatchService {
  constructor(
    private readonly clipperProjectsService: ClipperProjectsService,
    private readonly clipperGenerationService: ClipperGenerationService,
    private readonly clipperGenerationRequestService: ClipperGenerationRequestService,
    private readonly clipperIdentityResolutionService: ClipperIdentityResolutionService,
    private readonly clipperResultsService: ClipperResultsService,
  ) {}

  async generateClips(
    organizationId: string,
    userId: string,
    projectId: string,
    dto: GenerateClipsDto,
  ): Promise<ClipperGenerationResult<ClipperReferenceApplication>> {
    const {
      identity,
      mode,
      persistedHighlights,
      project,
      reference,
      runReferences,
      selectedHighlights: selectedEditedHighlights,
    } = await this.clipperGenerationRequestService.prepare({
      dto,
      organizationId,
      projectId,
    });

    const hookApprovalRequired =
      mode === 'avatar' &&
      selectedEditedHighlights.length > 1 &&
      dto.hookApprovalRequired !== false;
    await this.clipperProjectsService.patch(
      projectId,
      {
        highlights: persistedHighlights,
        progress: 0,
        settings: {
          ...project.settings,
          ...clipperGenerationIdentity(identity),
          avatarProvider: dto.avatarProvider ?? 'heygen',
          flow: 'review',
          mode,
          voiceId: identity?.voiceId,
        },
        status: 'generating',
      },
      [],
      organizationId,
    );

    const result = await this.clipperGenerationService.generateClips({
      ...clipperGenerationIdentity(identity),
      highlights: selectedEditedHighlights,
      hookApprovalRequired,
      mode,
      orgId: organizationId,
      projectId,
      provider: dto.avatarProvider ?? 'heygen',
      ...(reference.referenceImageUrl
        ? { referenceImageUrl: reference.referenceImageUrl }
        : {}),
      ...(reference.application
        ? { referenceProvenance: reference.application.provenance }
        : {}),
      runReferences,
      sourceVideoS3Key: project.sourceVideoS3Key,
      sourceVideoUrl: project.sourceVideoUrl,
      transcriptSegments: Array.isArray(project.transcriptSegments)
        ? project.transcriptSegments.filter(isTranscriptSegment)
        : [],
      transcriptText: project.transcriptText,
      userId,
      voiceId: identity?.voiceId,
    });

    if (result.queuedClipCount === 0) {
      await this.clipperProjectsService.patch(
        projectId,
        {
          error: 'Clip generation failed before any generation job was queued.',
          progress: 100,
          status: 'failed',
        },
        [],
        organizationId,
      );
    }

    return serializeClipperGenerationResult({
      clipCount: selectedEditedHighlights.length,
      clipperResultIds: result.clipperResultIds,
      ...(reference.application ? { reference: reference.application } : {}),
      status: toDispatchedStatus(result),
    });
  }

  async retryFailedClips(
    organizationId: string,
    userId: string,
    projectId: string,
  ): Promise<ClipperGenerationResult<ClipperReferenceApplication>> {
    const project = await this.clipperProjectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId,
    });
    if (!project) {
      throw new NotFoundException('ClipperProject', projectId);
    }

    const failedResults = (
      await this.clipperResultsService.findByProject(projectId, organizationId)
    ).filter(
      (result) => result.status === 'failed' || result.status === 'degraded',
    );
    if (failedResults.length === 0) {
      throw new BadRequestException(
        'This project has no failed clips to retry.',
      );
    }

    const mode = project.settings?.mode ?? DEFAULT_CLIP_RESULT_MODE;
    const provider = project.settings?.avatarProvider ?? 'heygen';
    const identity =
      mode === 'avatar' && provider !== 'genfeedai'
        ? await this.clipperIdentityResolutionService.resolve({
            avatarId: project.settings?.avatarId,
            avatarProvider: project.settings?.avatarProvider,
            brandId: project.brandId,
            organizationId,
            voiceId: project.settings?.voiceId,
          })
        : undefined;
    this.clipperGenerationRequestService.assertCompleteAvatarIdentity(identity);

    const runReferences = project.brandId
      ? await this.clipperGenerationRequestService.resolveRunReferences(
          project.brandId,
          organizationId,
        )
      : [];
    const reference: ResolvedClipperReference =
      mode === 'avatar'
        ? this.clipperGenerationRequestService.resolveProjectReference({
            mode,
            project,
            provider,
          })
        : {};
    this.clipperGenerationRequestService.assertProviderRequirements(
      provider,
      reference,
      runReferences,
      mode,
    );
    const invalidRange = failedResults.find(
      (result) =>
        typeof result.startTime !== 'number' ||
        !Number.isFinite(result.startTime) ||
        typeof result.endTime !== 'number' ||
        !Number.isFinite(result.endTime) ||
        result.endTime <= result.startTime,
    );
    if (invalidRange) {
      throw new BadRequestException(
        `Failed clip result ${String(invalidRange.id)} has an invalid source time range.`,
      );
    }
    const highlights = failedResults.map((result) => ({
      clip_type: readNonEmptyStringOrNull(result.clipType) ?? 'highlight',
      end_time: result.endTime as number,
      start_time: result.startTime as number,
      summary: readNonEmptyStringOrNull(result.summary) ?? '',
      tags: Array.isArray(result.tags)
        ? result.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      title: readNonEmptyStringOrNull(result.title) ?? 'Clip',
      virality_score:
        typeof result.viralityScore === 'number' ? result.viralityScore : 0,
    }));

    const claimed = await this.clipperProjectsService.claimFailedResultRetry(
      projectId,
      organizationId,
      failedResults.length,
    );
    if (!claimed) {
      throw new BadRequestException(
        'Failed clips are already being retried or the project is no longer retryable.',
      );
    }

    let generated: ClipperGenerationJobResult;
    try {
      generated = await this.clipperGenerationService.generateClips({
        ...clipperGenerationIdentity(identity),
        highlights,
        hookApprovalRequired: false,
        mode,
        orgId: organizationId,
        projectId,
        provider,
        ...(reference.referenceImageUrl
          ? { referenceImageUrl: reference.referenceImageUrl }
          : {}),
        ...(reference.application
          ? { referenceProvenance: reference.application.provenance }
          : {}),
        runReferences,
        sourceVideoS3Key: project.sourceVideoS3Key,
        sourceVideoUrl: project.sourceVideoUrl,
        transcriptSegments: Array.isArray(project.transcriptSegments)
          ? project.transcriptSegments.filter(isTranscriptSegment)
          : [],
        transcriptText: project.transcriptText,
        userId,
        voiceId: identity?.voiceId,
      });
    } catch (error: unknown) {
      await this.clipperProjectsService.patch(
        projectId,
        {
          error: 'Failed clip retry dispatch did not complete.',
          failedClipCount: failedResults.length,
          pendingClipCount: 0,
          status: project.status,
        },
        [],
        organizationId,
      );
      throw error;
    }

    if (generated.clipperResultIds.length > 0) {
      await Promise.all(
        failedResults.map((result) =>
          this.clipperResultsService.patch(
            String(result.id),
            { isDeleted: true },
            [],
            organizationId,
          ),
        ),
      );
    }
    if (
      generated.queuedClipCount === 0 ||
      (!generated.awaitingHookApproval &&
        generated.completedClipCount === generated.queuedClipCount)
    ) {
      await this.clipperProjectsService.reconcileTerminalState(
        projectId,
        organizationId,
      );
    }

    return serializeClipperGenerationResult({
      clipCount: failedResults.length,
      clipperResultIds: generated.clipperResultIds,
      status: toDispatchedStatus(generated),
    });
  }
}
