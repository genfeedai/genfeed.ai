import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type {
  GenerateClipHighlightDto,
  GenerateClipsDto,
} from '@api/collections/clip-projects/dto/generate-clips.dto';
import type {
  ClipProjectDocument,
  ClipProjectHighlight,
} from '@api/collections/clip-projects/schemas/clip-project.schema';
import { ClipIdentityResolutionService } from '@api/collections/clip-projects/services/clip-identity-resolution.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import type {
  AgentClipRunIdentity,
  ClipResultMode,
} from '@genfeedai/interfaces';
import { DEFAULT_CLIP_RESULT_MODE } from '@genfeedai/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface PrepareClipGenerationParams {
  dto: GenerateClipsDto;
  organizationId: string;
  projectId: string;
}

export interface PreparedClipGeneration {
  identity?: AgentClipRunIdentity;
  mode: ClipResultMode;
  persistedHighlights: ClipProjectHighlight[];
  project: ClipProjectDocument;
  selectedHighlights: ClipProjectHighlight[];
}

/**
 * Validates and prepares a clip-generation request before any queue work is
 * scheduled: project lookup, status gate, avatar identity resolution, raw-cut
 * source requirements, and reconciliation of edited vs. selected highlights.
 *
 * Kept out of the controller so the HTTP layer stays a thin adapter.
 */
@Injectable()
export class ClipGenerationRequestService {
  constructor(
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipIdentityResolutionService: ClipIdentityResolutionService,
  ) {}

  async prepare({
    dto,
    organizationId,
    projectId,
  }: PrepareClipGenerationParams): Promise<PreparedClipGeneration> {
    const mode = dto.mode ?? DEFAULT_CLIP_RESULT_MODE;

    const project = await this.clipProjectsService.findOne({
      _id: projectId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!project) {
      throw new NotFoundException('ClipProject', projectId);
    }

    if (project.status !== 'analyzed') {
      throw new BadRequestException(
        `Project is in '${project.status}' status. Must be 'analyzed' to generate clips.`,
      );
    }

    const identity =
      mode === 'avatar'
        ? await this.clipIdentityResolutionService.resolve({
            avatarId: dto.avatarId,
            avatarProvider: dto.avatarProvider,
            brandId: project.brandId,
            organizationId,
            voiceId: dto.voiceId,
          })
        : undefined;

    this.assertCompleteAvatarIdentity(identity);

    if (
      mode === 'raw-cut' &&
      !project.sourceVideoS3Key &&
      !project.sourceVideoUrl
    ) {
      throw new BadRequestException(
        'Raw-cut clip generation requires a source video.',
      );
    }

    const persistedHighlights = this.applyHighlightEdits(
      project.highlights || [],
      dto.editedHighlights,
    );
    const selectedHighlights = persistedHighlights.filter((highlight) =>
      dto.selectedHighlightIds.includes(highlight.id),
    );

    if (selectedHighlights.length === 0) {
      throw new BadRequestException(
        'No valid highlights matched the selected IDs.',
      );
    }

    return {
      identity,
      mode,
      persistedHighlights,
      project,
      selectedHighlights,
    };
  }

  private applyHighlightEdits(
    highlights: ClipProjectHighlight[],
    editedHighlights: GenerateClipHighlightDto[],
  ): ClipProjectHighlight[] {
    const editedHighlightsById = new Map<string, GenerateClipHighlightDto>(
      editedHighlights.map((highlight) => [highlight.id, highlight]),
    );

    return highlights.map((highlight) => {
      const editedHighlight = editedHighlightsById.get(highlight.id);

      if (!editedHighlight) {
        return highlight;
      }

      return {
        ...highlight,
        summary: editedHighlight.summary,
        title: editedHighlight.title,
      };
    });
  }

  assertCompleteAvatarIdentity(identity?: AgentClipRunIdentity): void {
    if (!identity || identity.isComplete) {
      return;
    }

    throw new BadRequestException(
      `${identity.label}. Configure saved brand defaults or provide explicit ${identity.missing.join(' and ')} IDs.`,
    );
  }
}
