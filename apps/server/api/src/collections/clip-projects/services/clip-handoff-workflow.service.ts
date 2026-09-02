import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import {
  type ClipLibraryLinkResult,
  ClipLibraryLinkService,
} from '@api/collections/clip-projects/services/clip-library-link.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { CreateEditorProjectDto } from '@api/collections/editor-projects/dto/create-editor-project.dto';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import {
  type SystemWorkflowActionRequest,
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { EditorTrackType, IngredientFormat } from '@genfeedai/contracts';
import type { ClipReadyAction } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

const CLIP_HANDOFF_ACTION_IDS = {
  CREATE_EDITOR: 'clip.handoff.create-editor',
  LINK_LIBRARY: 'clip.handoff.link-library',
  PREPARE_PUBLISH: 'clip.handoff.prepare-publish',
} as const;

const CLIP_HANDOFF_WORKFLOW_IDS = {
  CREATE_EDITOR: 'clip.handoff.editor',
  LINK_LIBRARY: 'clip.handoff.library-link',
  PREPARE_PUBLISH: 'clip.handoff.publish-prepare',
} as const;

function clipHandoffDefinition(
  canonicalId: string,
  actionId: (typeof CLIP_HANDOFF_ACTION_IDS)[keyof typeof CLIP_HANDOFF_ACTION_IDS],
  label: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'projectId',
          label: 'Clip project',
          required: true,
          type: 'string',
        },
        {
          key: 'clipResultId',
          label: 'Clip result',
          required: true,
          type: 'string',
        },
        { key: 'brandId', label: 'Brand', required: false, type: 'string' },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId,
          id: 'handoff',
          inputVariableKeys: ['projectId', 'clipResultId', 'brandId'],
        }),
      ],
    },
    description: label,
    label,
    resultNodeId: 'handoff',
    version: 1,
  };
}

export interface ClipEditorHandoffResult {
  clipProjectId: string;
  clipResultId: string;
  editorPath: string;
  editorProjectId: string;
  videoUrl: string;
}

export interface PublishAsset {
  assetId: string;
  mediaUrl: string;
  mimeType: string;
  caption?: string;
}

export interface ClipPublishHandoffResult {
  clipProjectId: string;
  clipResultId: string;
  payload: {
    assets: PublishAsset[];
    clipProjectId: string;
    confirmBeforePublish: true;
    metadata: Record<string, unknown>;
    platforms: string[];
    preparedAt: string;
    schedule: 'immediate';
  };
}

type ClipHandoffInput = {
  brandId?: string;
  clipResultId: string;
  projectId: string;
};

@Injectable()
export class ClipHandoffWorkflowService implements OnModuleInit {
  constructor(
    private readonly clipLibraryLinkService: ClipLibraryLinkService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipResultsService: ClipResultsService,
    private readonly editorProjectsService: EditorProjectsService,
    private readonly logger: LoggerService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      CLIP_HANDOFF_ACTION_IDS.CREATE_EDITOR,
      (request) => this.executeEditorHandoff(request),
    );
    this.workflowRunner.registerAction(
      CLIP_HANDOFF_ACTION_IDS.PREPARE_PUBLISH,
      (request) => this.executePublishHandoff(request),
    );
    this.workflowRunner.registerAction(
      CLIP_HANDOFF_ACTION_IDS.LINK_LIBRARY,
      (request) => this.executeLibraryLink(request),
    );
    this.workflowRunner.registerWorkflow(
      clipHandoffDefinition(
        CLIP_HANDOFF_WORKFLOW_IDS.CREATE_EDITOR,
        CLIP_HANDOFF_ACTION_IDS.CREATE_EDITOR,
        'Create Clip Editor Project',
      ),
    );
    this.workflowRunner.registerWorkflow(
      clipHandoffDefinition(
        CLIP_HANDOFF_WORKFLOW_IDS.PREPARE_PUBLISH,
        CLIP_HANDOFF_ACTION_IDS.PREPARE_PUBLISH,
        'Prepare Clip Publish Payload',
      ),
    );
    this.workflowRunner.registerWorkflow(
      clipHandoffDefinition(
        CLIP_HANDOFF_WORKFLOW_IDS.LINK_LIBRARY,
        CLIP_HANDOFF_ACTION_IDS.LINK_LIBRARY,
        'Link Clip to Library',
      ),
    );
  }

  async createEditorHandoff(
    input: ClipHandoffInput,
    context: { organizationId: string; userId: string },
  ): Promise<ClipEditorHandoffResult> {
    return this.runWorkflow<ClipEditorHandoffResult>(
      CLIP_HANDOFF_WORKFLOW_IDS.CREATE_EDITOR,
      CLIP_HANDOFF_ACTION_IDS.CREATE_EDITOR,
      input,
      context,
    );
  }

  async preparePublishHandoff(
    input: ClipHandoffInput,
    context: { organizationId: string; userId: string },
  ): Promise<ClipPublishHandoffResult> {
    return this.runWorkflow<ClipPublishHandoffResult>(
      CLIP_HANDOFF_WORKFLOW_IDS.PREPARE_PUBLISH,
      CLIP_HANDOFF_ACTION_IDS.PREPARE_PUBLISH,
      input,
      context,
    );
  }

  async retryLibraryLink(
    input: ClipHandoffInput,
    context: { organizationId: string; userId: string },
  ): Promise<ClipLibraryLinkResult> {
    return this.runWorkflow<ClipLibraryLinkResult>(
      CLIP_HANDOFF_WORKFLOW_IDS.LINK_LIBRARY,
      CLIP_HANDOFF_ACTION_IDS.LINK_LIBRARY,
      input,
      context,
    );
  }

  private async runWorkflow<T>(
    workflowId: (typeof CLIP_HANDOFF_WORKFLOW_IDS)[keyof typeof CLIP_HANDOFF_WORKFLOW_IDS],
    actionId: (typeof CLIP_HANDOFF_ACTION_IDS)[keyof typeof CLIP_HANDOFF_ACTION_IDS],
    input: ClipHandoffInput,
    context: { organizationId: string; userId: string },
  ): Promise<T> {
    const { result } = await this.workflowRunner.runWorkflow<T>({
      actionType: actionId,
      canonicalId: workflowId,
      inputValues: input,
      organizationId: context.organizationId,
      source: 'clip-project-handoff',
      userId: context.userId,
    });
    return result;
  }

  private async executeEditorHandoff(
    request: SystemWorkflowActionRequest,
  ): Promise<ClipEditorHandoffResult> {
    const input = this.readInput(request.input);
    const organizationId = request.context.organizationId;
    const ownedProject = await this.resolveOwnedProject(
      input.projectId,
      organizationId,
    );
    await this.clipProjectsService.reconcileTerminalState(
      input.projectId,
      organizationId,
      ownedProject,
    );
    const clipResult = await this.resolveReadyClipResult({
      action: 'edit',
      clipResultId: input.clipResultId,
      organizationId,
      projectId: input.projectId,
    });
    const videoUrl = this.resolveClipVideoUrl(clipResult);
    const ingredientId = this.requireLinkedIngredientId(clipResult);
    const durationFrames = this.resolveClipDurationFrames(clipResult);
    const editorProject = await this.editorProjectsService.create({
      ...(input.brandId ? { brandId: input.brandId } : {}),
      config: {
        clipHandoff: {
          clipProjectId: input.projectId,
          clipResultId: String(clipResult.id),
          ingredientId,
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
      organizationId,
      tracks: [
        {
          clips: [
            {
              durationFrames,
              effects: [],
              id: uuidv4(),
              ingredientId,
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
      userId: request.context.userId,
    } as CreateEditorProjectDto);
    const editorProjectId = String(editorProject.id);
    return {
      clipProjectId: input.projectId,
      clipResultId: String(clipResult.id),
      editorPath: `/studio/edit/${editorProjectId}`,
      editorProjectId,
      videoUrl,
    };
  }

  private async executePublishHandoff(
    request: SystemWorkflowActionRequest,
  ): Promise<ClipPublishHandoffResult> {
    const input = this.readInput(request.input);
    const organizationId = request.context.organizationId;
    const ownedProject = await this.resolveOwnedProject(
      input.projectId,
      organizationId,
    );
    await this.clipProjectsService.reconcileTerminalState(
      input.projectId,
      organizationId,
      ownedProject,
    );
    const clipResult = await this.resolveReadyClipResult({
      action: 'publish',
      clipResultId: input.clipResultId,
      organizationId,
      projectId: input.projectId,
    });
    const clipResultId = String(clipResult.id);
    const ingredientId = this.requireLinkedIngredientId(clipResult);
    const videoUrl = this.resolveClipVideoUrl(clipResult);
    const summary = this.readString(clipResult.summary);
    const title = this.readString(clipResult.title);
    const payload = {
      assets: [
        {
          ...(summary ? { caption: summary } : {}),
          assetId: ingredientId,
          mediaUrl: videoUrl,
          mimeType: 'video/mp4',
        },
      ],
      clipProjectId: input.projectId,
      confirmBeforePublish: true as const,
      metadata: {
        clipResultId,
        ingredientId,
        ...(summary ? { summary } : {}),
        ...(title ? { title } : {}),
      },
      platforms: ['instagram'],
      preparedAt: new Date().toISOString(),
      schedule: 'immediate' as const,
    };
    this.logger.log('Clip publish handoff prepared', {
      clipProjectId: input.projectId,
      clipResultId,
    });
    return { clipProjectId: input.projectId, clipResultId, payload };
  }

  private async executeLibraryLink(
    request: SystemWorkflowActionRequest,
  ): Promise<ClipLibraryLinkResult> {
    const input = this.readInput(request.input);
    const organizationId = request.context.organizationId;
    await this.resolveOwnedProject(input.projectId, organizationId);
    const clipResult =
      await this.clipResultsService.findProjectResultForHandoff({
        clipResultId: input.clipResultId,
        organizationId,
        projectId: input.projectId,
      });
    if (!clipResult) {
      throw new NotFoundException('ClipResult', input.clipResultId);
    }
    if (this.readString(clipResult.status) !== 'completed') {
      throw new BadRequestException(
        `ClipResult ${input.clipResultId} is not ready for Library linking.`,
      );
    }
    return this.clipLibraryLinkService.linkReadyClip({
      clipResultId: String(clipResult.id),
      organizationId,
    });
  }

  private async resolveOwnedProject(
    projectId: string,
    organizationId: string,
  ): Promise<ClipProjectDocument> {
    const project = await this.clipProjectsService.findOne({
      id: projectId,
      organizationId,
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
    return readyActions.length > 0
      ? readyActions.includes(action)
      : this.readString(clipResult.status) === 'completed';
  }

  private requireLinkedIngredientId(clipResult: ClipResultDocument): string {
    const ingredientId = this.readString(clipResult.ingredientId);
    if (!ingredientId) {
      throw new BadRequestException(
        'Clip result is not linked to a Library asset. Retry Library linking first.',
      );
    }
    return ingredientId;
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

  private readInput(input: Record<string, unknown>): ClipHandoffInput {
    const projectId = this.requiredString(input.projectId, 'projectId');
    const clipResultId = this.requiredString(
      input.clipResultId,
      'clipResultId',
    );
    const brandId = this.readString(input.brandId);
    return { ...(brandId ? { brandId } : {}), clipResultId, projectId };
  }

  private requiredString(value: unknown, field: string): string {
    const normalized = this.readString(value);
    if (!normalized) {
      throw new Error(`Clip handoff action requires ${field}`);
    }
    return normalized;
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
