import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { PublishHandoffService } from '@api/services/clip-orchestrator/publish-handoff.service';
import { EditorTrackType, IngredientFormat } from '@genfeedai/enums';
import type { ClipReadyAction } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { v4 as uuidv4 } from 'uuid';

interface ClipEditorHandoffResponse {
  clipProjectId: string;
  clipResultId: string;
  editorPath: string;
  editorProjectId: string;
  videoUrl: string;
}

interface ClipPublishHandoffResponse {
  clipProjectId: string;
  clipResultId: string;
  payload: Awaited<ReturnType<PublishHandoffService['preparePublishHandoff']>>;
}

@AutoSwagger()
@ApiTags('clip-projects')
@ApiBearerAuth()
@Controller('clip-projects')
@UseGuards(RolesGuard)
export class ClipProjectHandoffsController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipResultsService: ClipResultsService,
    private readonly editorProjectsService: EditorProjectsService,
    private readonly publishHandoffService: PublishHandoffService,
  ) {}

  @Post(':projectId/results/:clipResultId/editor-handoff')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Validate a ready clip result and create an editor project handoff from its terminal media URL.',
    summary: 'Create editor handoff for a ready clip result',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createEditorHandoff(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('clipResultId') clipResultId: string,
  ): Promise<ClipEditorHandoffResponse> {
    const publicMetadata = getPublicMetadata(user);
    const ownedProject = await this.resolveOwnedProject(
      projectId,
      publicMetadata.organization,
    );
    await this.clipProjectsService.reconcileTerminalState(
      projectId,
      publicMetadata.organization,
      ownedProject,
    );

    const clipResult = await this.resolveReadyClipResult({
      action: 'edit',
      clipResultId,
      organizationId: publicMetadata.organization,
      projectId,
    });
    const videoUrl = this.resolveClipVideoUrl(clipResult);
    const durationFrames = this.resolveClipDurationFrames(clipResult);
    const editorProject = await this.editorProjectsService.create({
      ...(publicMetadata.brand ? { brandId: publicMetadata.brand } : {}),
      config: {
        clipHandoff: {
          clipProjectId: projectId,
          clipResultId: String(clipResult.id),
          source: 'clip-result',
        },
        name: `${this.readString(clipResult.title) ?? 'Clip'} edit`,
        settings: {
          backgroundColor: '#000000',
          format: IngredientFormat.PORTRAIT,
          fps: 30,
          height: 1920,
          width: 1080,
        },
        status: 'draft',
        totalDurationFrames: durationFrames,
      },
      organizationId: publicMetadata.organization,
      tracks: [
        {
          clips: [
            {
              durationFrames,
              effects: [],
              id: uuidv4(),
              ingredientId: String(clipResult.id),
              ingredientUrl: videoUrl,
              sourceEndFrame: durationFrames,
              sourceStartFrame: 0,
              startFrame: 0,
              thumbnailUrl: this.readString(clipResult.thumbnailUrl),
              volume: 100,
            },
          ],
          id: uuidv4(),
          isLocked: false,
          isMuted: false,
          name: 'Clip 1',
          type: EditorTrackType.VIDEO,
          volume: 100,
        },
      ],
      userId: publicMetadata.user,
    } as never);
    const editorProjectId = String(editorProject.id);

    return {
      clipProjectId: projectId,
      clipResultId: String(clipResult.id),
      editorPath: `/editor/${editorProjectId}`,
      editorProjectId,
      videoUrl,
    };
  }

  @Post(':projectId/results/:clipResultId/publish-handoff')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Validate a ready clip result and prepare a user-confirmed publish handoff payload.',
    summary: 'Prepare publish handoff for a ready clip result',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createPublishHandoff(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('clipResultId') clipResultId: string,
  ): Promise<ClipPublishHandoffResponse> {
    const publicMetadata = getPublicMetadata(user);
    const ownedProject = await this.resolveOwnedProject(
      projectId,
      publicMetadata.organization,
    );
    await this.clipProjectsService.reconcileTerminalState(
      projectId,
      publicMetadata.organization,
      ownedProject,
    );

    const clipResult = await this.resolveReadyClipResult({
      action: 'publish',
      clipResultId,
      organizationId: publicMetadata.organization,
      projectId,
    });
    const resolvedClipResultId = String(clipResult.id);
    const videoUrl = this.resolveClipVideoUrl(clipResult);
    const payload = await this.publishHandoffService.preparePublishHandoff(
      projectId,
      [resolvedClipResultId],
      {
        assets: {
          [resolvedClipResultId]: {
            caption: this.readString(clipResult.summary) ?? undefined,
            mediaUrl: videoUrl,
            mimeType: 'video/mp4',
          },
        },
        metadata: {
          clipResultId: resolvedClipResultId,
          summary: this.readString(clipResult.summary),
          title: this.readString(clipResult.title),
        },
      },
    );

    return {
      clipProjectId: projectId,
      clipResultId: resolvedClipResultId,
      payload,
    };
  }

  private async resolveOwnedProject(
    projectId: string,
    organizationId: string,
  ): Promise<ClipProjectDocument> {
    const project = await this.clipProjectsService.findOne({
      _id: projectId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!project) {
      throw new NotFoundException('ClipProject', projectId);
    }

    return project;
  }

  private async resolveReadyClipResult(input: {
    action: ClipReadyAction;
    clipResultId: string;
    organizationId: string;
    projectId: string;
  }): Promise<ClipResultDocument> {
    const clipResult =
      await this.clipResultsService.findProjectResultForHandoff({
        clipResultId: input.clipResultId,
        organizationId: input.organizationId,
        projectId: input.projectId,
      });

    if (!clipResult) {
      throw new NotFoundException('ClipResult', input.clipResultId);
    }

    if (!this.isClipReadyForAction(clipResult, input.action)) {
      throw new BadRequestException(
        `ClipResult ${input.clipResultId} is not ready for ${input.action} handoff.`,
      );
    }

    this.resolveClipVideoUrl(clipResult);

    return clipResult;
  }

  private isClipReadyForAction(
    clipResult: ClipResultDocument,
    action: ClipReadyAction,
  ): boolean {
    const readiness = this.readRecord(clipResult.readiness);
    const readyActions = Array.isArray(readiness.readyActions)
      ? readiness.readyActions
      : [];

    if (readyActions.length > 0) {
      return readyActions.includes(action);
    }

    return this.readString(clipResult.status) === 'completed';
  }

  private resolveClipVideoUrl(clipResult: ClipResultDocument): string {
    const videoUrl =
      this.readString(clipResult.captionedVideoUrl) ??
      this.readString(clipResult.videoUrl);

    if (!videoUrl) {
      throw new BadRequestException('Clip result has no terminal video URL.');
    }

    return videoUrl;
  }

  private resolveClipDurationFrames(clipResult: ClipResultDocument): number {
    const duration =
      typeof clipResult.duration === 'number' &&
      Number.isFinite(clipResult.duration)
        ? clipResult.duration
        : 10;

    return Math.max(1, Math.round(duration * 30));
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
