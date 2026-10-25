import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { ClipperProjectDocument } from '@api/collections/clipper-projects/schemas/clipper-project.schema';
import { buildClipperProjectReadiness } from '@api/collections/clipper-shared/clipper-terminal-contract.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PublicClipperToolStoreService } from '@api/services/public-clipper-tool/public-clipper-tool-store.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CLIPPER_SOURCE_SCHEMA_VERSION } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { ConflictException, GoneException, Injectable } from '@nestjs/common';

interface ClaimPublicYoutubeClipperInput {
  readonly brandId?: string;
  readonly previewToken: string;
  readonly user: AuthenticatedUser;
}

@Injectable()
export class PublicYoutubeClipperClaimService {
  constructor(
    private readonly clipperProjectsService: ClipperProjectsService,
    private readonly prisma: PrismaService,
    private readonly store: PublicClipperToolStoreService,
  ) {}

  async claim(
    input: ClaimPublicYoutubeClipperInput,
  ): Promise<ClipperProjectDocument> {
    const organizationId = input.user.organizationId;
    const userId = input.user.userId ?? input.user.id;
    const tokenHash = this.store.tokenHash(input.previewToken);
    const projectId = `public-youtube-clipper-${tokenHash}`;
    const existing = await this.findOwnedProject(projectId, organizationId);

    if (existing) {
      if (existing.userId !== userId) {
        throw this.alreadyClaimed();
      }
      return existing;
    }

    const session = await this.store.getSession(input.previewToken);
    if (session.status !== 'ready') {
      throw new GoneException({
        code: 'public_youtube_clipper_not_claimable',
        detail: 'The free-tool project is not ready to continue yet.',
        title: 'Gone',
      });
    }
    if (['generating', 'queued'].includes(session.preview.status)) {
      throw new ConflictException({
        code: 'public_youtube_clipper_preview_in_progress',
        detail: 'Wait for the free preview to finish before continuing.',
        title: 'Conflict',
      });
    }

    const preview =
      session.preview.status === 'ready' && session.preview.url
        ? session.preview
        : undefined;
    const highlight = preview?.recommendationId
      ? session.highlights.find(
          (candidate) => candidate.id === preview.recommendationId,
        )
      : undefined;
    const terminalAt = preview ? new Date() : null;
    const projectStatus = preview ? 'completed' : 'analyzed';

    try {
      await this.prisma.$transaction(async (transaction) => {
        if (input.brandId) {
          const brand = await transaction.brand.findFirst({
            select: { id: true },
            where: scopedWhere(organizationId, {
              id: input.brandId,
              isDeleted: false,
            }),
          });
          if (!brand) {
            throw new NotFoundException('Brand', input.brandId);
          }
        }

        await transaction.clipperProject.create({
          data: {
            ...(input.brandId ? { brandId: input.brandId } : {}),
            config: this.toJsonValue({
              highlights: session.highlights,
              language: session.language,
              name: 'Free YouTube clip project',
              publicTool: {
                claimedAt: new Date().toISOString(),
                previewIncluded: Boolean(preview),
              },
              settings: {
                addCaptions: true,
                aspectRatio: '9:16',
                captionStyle: 'default',
                maxClips: 3,
                maxDuration: 90,
                minDuration: 15,
                mode: 'raw-cut',
              },
              ...(session.sourceArtifact
                ? {
                    source: {
                      artifact: session.sourceArtifact,
                      fingerprint: session.sourceFingerprint,
                      flow: 'review',
                      kind: 'youtube',
                      maxRetries: 3,
                      retryCount: 0,
                      schemaVersion: CLIPPER_SOURCE_SCHEMA_VERSION,
                      status: 'completed',
                      updatedAt: new Date().toISOString(),
                    },
                  }
                : {}),
              ...(session.sourceVideoS3Key
                ? { sourceVideoS3Key: session.sourceVideoS3Key }
                : {}),
              sourceVideoUrl: session.sourceVideoUrl,
              transcriptSegments: session.transcriptSegments,
              ...(session.transcriptSrt
                ? { transcriptSrt: session.transcriptSrt }
                : {}),
              ...(session.transcriptText
                ? { transcriptText: session.transcriptText }
                : {}),
            }),
            failedClipCount: 0,
            id: projectId,
            organizationId,
            pendingClipCount: 0,
            progress: 100,
            readiness: this.toJsonValue(
              buildClipperProjectReadiness({
                status: projectStatus,
                terminalAt,
              }),
            ),
            readyClipCount: preview ? 1 : 0,
            status: projectStatus,
            terminalAt,
            userId,
          },
        });

        if (preview && highlight) {
          await transaction.clipperResult.create({
            data: {
              data: {
                clipType: highlight.clip_type,
                duration: highlight.end_time - highlight.start_time,
                endTime: highlight.end_time,
                index: 0,
                providerName: 'public-youtube-clipper-tool',
                publicPreview: true,
                startTime: highlight.start_time,
                summary: highlight.summary,
                tags: highlight.tags,
                title: highlight.title,
                videoUrl: preview.url,
              },
              id: `public-youtube-clipper-result-${tokenHash}`,
              isSelected: true,
              mode: 'raw-cut',
              organizationId,
              projectId,
              readiness: {
                blockingReasons: [],
                readyActions: ['download'],
                state: 'ready',
                terminal: true,
                terminalAt: terminalAt?.toISOString(),
              },
              status: 'completed',
              terminalAt,
              userId,
              viralityScore: highlight.virality_score,
            },
          });
        }
      });
    } catch (error) {
      const racedProject = await this.findOwnedProject(
        projectId,
        organizationId,
      );
      if (racedProject?.userId === userId) {
        await this.store.deleteSession(input.previewToken);
        return racedProject;
      }
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw this.alreadyClaimed();
      }
      throw error;
    }

    await this.store.deleteSession(input.previewToken);
    const claimed = await this.findOwnedProject(projectId, organizationId);
    if (!claimed) {
      throw this.alreadyClaimed();
    }
    return claimed;
  }

  private findOwnedProject(
    projectId: string,
    organizationId: string,
  ): Promise<ClipperProjectDocument | null> {
    return this.clipperProjectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId,
    });
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    // The JSON round-trip strips undefined values and proves the runtime value
    // satisfies Prisma's JSON-only persistence boundary before the type cast.
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private alreadyClaimed(): GoneException {
    return new GoneException({
      code: 'public_youtube_clipper_expired_or_claimed',
      detail: 'This free-tool project has expired or was already claimed.',
      title: 'Gone',
    });
  }
}
