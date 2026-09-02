import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { GenerateClipsDto } from '@api/collections/clip-projects/dto/generate-clips.dto';
import {
  type ClipGenerationResult as ClipGenerationJobResult,
  ClipGenerationService,
} from '@api/collections/clip-projects/services/clip-generation.service';
import { ClipGenerationRequestService } from '@api/collections/clip-projects/services/clip-generation-request.service';
import { ClipIdentityResolutionService } from '@api/collections/clip-projects/services/clip-identity-resolution.service';
import type { ResolvedClipReference } from '@api/collections/clip-projects/services/clip-reference-generation.util';
import { isTranscriptSegment } from '@api/collections/clip-projects/services/clip-srt.util';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ClipReferenceApplication } from '@genfeedai/contracts/interfaces';
import { DEFAULT_CLIP_RESULT_MODE } from '@genfeedai/contracts/interfaces';
import {
  type ClipGenerationResult,
  serializeClipGenerationResult,
} from '@genfeedai/serializers';
import { BadRequestException, Injectable } from '@nestjs/common';

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toDispatchedStatus(
  result: ClipGenerationJobResult,
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
export class ClipGenerationDispatchService {
  constructor(
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipGenerationService: ClipGenerationService,
    private readonly clipGenerationRequestService: ClipGenerationRequestService,
    private readonly clipIdentityResolutionService: ClipIdentityResolutionService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly clipResultsService: ClipResultsService,
  ) {}

  async generateClips(
    organizationId: string,
    userId: string,
    projectId: string,
    dto: GenerateClipsDto,
  ): Promise<ClipGenerationResult<ClipReferenceApplication>> {
    const {
      identity,
      mode,
      persistedHighlights,
      project,
      reference,
      runReferences,
      selectedHighlights: selectedEditedHighlights,
    } = await this.clipGenerationRequestService.prepare({
      dto,
      organizationId,
      projectId,
    });

    const hookApprovalRequired =
      mode === 'avatar' &&
      selectedEditedHighlights.length > 1 &&
      dto.hookApprovalRequired !== false;
    const initialCreditCount = hookApprovalRequired
      ? 1
      : selectedEditedHighlights.length;
    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        initialCreditCount,
      );
    if (!hasCredits) {
      const currentBalance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        );
      throw new InsufficientCreditsException(
        initialCreditCount,
        currentBalance,
      );
    }

    await this.clipProjectsService.patch(
      projectId,
      {
        highlights: persistedHighlights,
        progress: 0,
        settings: {
          ...project.settings,
          avatarId: identity?.avatarId,
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

    const result = await this.clipGenerationService.generateClips({
      avatarId: identity?.avatarId,
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
      await this.clipProjectsService.patch(
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

    return serializeClipGenerationResult({
      clipCount: selectedEditedHighlights.length,
      clipResultIds: result.clipResultIds,
      ...(reference.application ? { reference: reference.application } : {}),
      status: toDispatchedStatus(result),
    });
  }

  async retryFailedClips(
    organizationId: string,
    userId: string,
    projectId: string,
  ): Promise<ClipGenerationResult<ClipReferenceApplication>> {
    const project = await this.clipProjectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId,
    });
    if (!project) {
      throw new NotFoundException('ClipProject', projectId);
    }

    const failedResults = (
      await this.clipResultsService.findByProject(projectId, organizationId)
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
        ? await this.clipIdentityResolutionService.resolve({
            avatarId: project.settings?.avatarId,
            avatarProvider: project.settings?.avatarProvider,
            brandId: project.brandId,
            organizationId,
            voiceId: project.settings?.voiceId,
          })
        : undefined;
    this.clipGenerationRequestService.assertCompleteAvatarIdentity(identity);

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        failedResults.length,
      );
    if (!hasCredits) {
      const currentBalance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        );
      throw new InsufficientCreditsException(
        failedResults.length,
        currentBalance,
      );
    }

    const runReferences = project.brandId
      ? await this.clipGenerationRequestService.resolveRunReferences(
          project.brandId,
          organizationId,
        )
      : [];
    const reference: ResolvedClipReference =
      mode === 'avatar'
        ? this.clipGenerationRequestService.resolveProjectReference({
            mode,
            project,
            provider,
          })
        : {};
    this.clipGenerationRequestService.assertProviderRequirements(
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
      clip_type: readNonEmptyString(result.clipType) ?? 'highlight',
      end_time: result.endTime as number,
      start_time: result.startTime as number,
      summary: readNonEmptyString(result.summary) ?? '',
      tags: Array.isArray(result.tags)
        ? result.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      title: readNonEmptyString(result.title) ?? 'Clip',
      virality_score:
        typeof result.viralityScore === 'number' ? result.viralityScore : 0,
    }));

    const claimed = await this.clipProjectsService.claimFailedResultRetry(
      projectId,
      organizationId,
      failedResults.length,
    );
    if (!claimed) {
      throw new BadRequestException(
        'Failed clips are already being retried or the project is no longer retryable.',
      );
    }

    let generated: ClipGenerationJobResult;
    try {
      generated = await this.clipGenerationService.generateClips({
        avatarId: identity?.avatarId,
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
      await this.clipProjectsService.patch(
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

    if (generated.clipResultIds.length > 0) {
      await Promise.all(
        failedResults.map((result) =>
          this.clipResultsService.patch(
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
      await this.clipProjectsService.reconcileTerminalState(
        projectId,
        organizationId,
      );
    }

    return serializeClipGenerationResult({
      clipCount: failedResults.length,
      clipResultIds: generated.clipResultIds,
      status: toDispatchedStatus(generated),
    });
  }
}
