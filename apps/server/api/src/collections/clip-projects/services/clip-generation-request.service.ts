import { BrandsService } from '@api/collections/brands/services/brands.service';
import { toBrandGenerationReferences } from '@api/collections/brands/utils/brand-kit-generation-references.util';
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
import {
  type ResolvedClipReference,
  resolveSelectedClipReference,
} from '@api/collections/clip-projects/services/clip-reference-generation.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type {
  AgentClipRunIdentity,
  ClipGenerationReference,
  ClipResultMode,
  SupportedAvatarVideoProviderName,
} from '@genfeedai/contracts/interfaces';
import {
  DEFAULT_CLIP_REFERENCE_POLICY,
  DEFAULT_CLIP_RESULT_MODE,
} from '@genfeedai/contracts/interfaces';
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
  reference: ResolvedClipReference;
  runReferences: readonly ClipGenerationReference[];
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
    private readonly brandsService: BrandsService,
  ) {}

  async prepare({
    dto,
    organizationId,
    projectId,
  }: PrepareClipGenerationParams): Promise<PreparedClipGeneration> {
    const mode = dto.mode ?? DEFAULT_CLIP_RESULT_MODE;
    const provider = dto.avatarProvider ?? 'heygen';

    const project = await this.clipProjectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId: organizationId,
    });

    if (!project) {
      throw new NotFoundException('ClipProject', projectId);
    }

    if (project.status !== 'analyzed') {
      throw new BadRequestException(
        `Project is in '${project.status}' status. Must be 'analyzed' to generate clips.`,
      );
    }

    const reference = resolveSelectedClipReference({
      mode,
      policy: dto.referencePolicy ?? DEFAULT_CLIP_REFERENCE_POLICY,
      project,
      provider,
    });

    const identity =
      mode === 'avatar' && provider !== 'genfeedai'
        ? await this.clipIdentityResolutionService.resolve({
            avatarId: dto.avatarId,
            avatarProvider: dto.avatarProvider,
            brandId: project.brandId,
            organizationId,
            voiceId: dto.voiceId,
          })
        : undefined;

    const runReferences = project.brandId
      ? await this.resolveRunReferences(project.brandId, organizationId)
      : [];

    this.assertCompleteAvatarIdentity(identity);
    this.assertProviderRequirements(provider, reference, runReferences, mode);

    if (
      mode === 'raw-cut' &&
      !project.sourceVideoS3Key &&
      !project.sourceVideoUrl
    ) {
      throw new BadRequestException(
        'Raw-cut clip generation requires a source video.',
      );
    }
    if (
      mode === 'raw-cut' &&
      project.source?.contentType?.startsWith('audio/')
    ) {
      throw new BadRequestException(
        'Raw-cut clip generation requires source video, not audio-only media.',
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
      reference,
      runReferences,
      selectedHighlights,
    };
  }

  resolveProjectReference(input: {
    mode: ClipResultMode;
    project: ClipProjectDocument;
    provider: SupportedAvatarVideoProviderName;
  }): ResolvedClipReference {
    return resolveSelectedClipReference({
      mode: input.mode,
      policy: DEFAULT_CLIP_REFERENCE_POLICY,
      project: input.project,
      provider: input.provider,
    });
  }

  assertProviderRequirements(
    provider: SupportedAvatarVideoProviderName,
    reference: ResolvedClipReference,
    runReferences: readonly ClipGenerationReference[],
    mode: ClipResultMode,
  ): void {
    if (mode !== 'avatar' || provider !== 'genfeedai') {
      return;
    }

    const hasCharacterReference = runReferences.some(
      (item) => item.role === 'character' && item.url.length > 0,
    );
    if (!reference.referenceImageUrl && !hasCharacterReference) {
      throw new BadRequestException(
        'GenfeedAI managed clip generation requires a selected reference frame or brand character reference.',
      );
    }
  }

  async resolveRunReferences(
    brandId: string,
    organizationId: string,
  ): Promise<readonly ClipGenerationReference[]> {
    const brandKit = await this.brandsService.resolveBrandKitAssets(
      brandId,
      organizationId,
    );
    const urlsById = new Map(
      brandKit.references.map((reference) => [reference.id, reference.url]),
    );
    return Object.freeze(
      toBrandGenerationReferences(brandKit).map((reference) =>
        Object.freeze({
          ...reference,
          url: urlsById.get(reference.assetId) as string,
        }),
      ),
    );
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
