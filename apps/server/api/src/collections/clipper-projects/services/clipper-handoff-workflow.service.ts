import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { ClipperProjectDocument } from '@api/collections/clipper-projects/schemas/clipper-project.schema';
import {
  type ClipperLibraryLinkResult,
  ClipperLibraryLinkService,
} from '@api/collections/clipper-projects/services/clipper-library-link.service';
import { assertClipperWorkflowActor } from '@api/collections/clipper-projects/services/clipper-workflow-actor.util';
import { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import type { ClipperResultDocument } from '@api/collections/clipper-results/schemas/clipper-result.schema';
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
import type { ClipperReadyAction } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

const CLIPPER_HANDOFF_ACTION_IDS = {
  CREATE_EDITOR: 'clipper.handoff.create-editor',
  LINK_LIBRARY: 'clipper.handoff.link-library',
  PREPARE_PUBLISH: 'clipper.handoff.prepare-publish',
} as const;

const CLIPPER_HANDOFF_WORKFLOW_IDS = {
  CREATE_EDITOR: 'clipper.handoff.editor',
  LINK_LIBRARY: 'clipper.handoff.library-link',
  PREPARE_PUBLISH: 'clipper.handoff.publish-prepare',
} as const;

function clipperHandoffDefinition(
  canonicalId: string,
  actionId: (typeof CLIPPER_HANDOFF_ACTION_IDS)[keyof typeof CLIPPER_HANDOFF_ACTION_IDS],
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
          key: 'clipperResultId',
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
          inputVariableKeys: ['projectId', 'clipperResultId', 'brandId'],
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
  clipperProjectId: string;
  clipperResultId: string;
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
  clipperProjectId: string;
  clipperResultId: string;
  payload: {
    assets: PublishAsset[];
    clipperProjectId: string;
    confirmBeforePublish: true;
    metadata: Record<string, unknown>;
    platforms: string[];
    preparedAt: string;
    schedule: 'immediate';
  };
}

type ClipperHandoffInput = {
  brandId?: string;
  clipperResultId: string;
  projectId: string;
};

@Injectable()
export class ClipperHandoffWorkflowService implements OnModuleInit {
  constructor(
    private readonly clipperLibraryLinkService: ClipperLibraryLinkService,
    private readonly clipperProjectsService: ClipperProjectsService,
    private readonly clipperResultsService: ClipperResultsService,
    private readonly editorProjectsService: EditorProjectsService,
    private readonly logger: LoggerService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      CLIPPER_HANDOFF_ACTION_IDS.CREATE_EDITOR,
      (request) => this.executeEditorHandoff(request),
    );
    this.workflowRunner.registerAction(
      CLIPPER_HANDOFF_ACTION_IDS.PREPARE_PUBLISH,
      (request) => this.executePublishHandoff(request),
    );
    this.workflowRunner.registerAction(
      CLIPPER_HANDOFF_ACTION_IDS.LINK_LIBRARY,
      (request) => this.executeLibraryLink(request),
    );
    this.workflowRunner.registerWorkflow(
      clipperHandoffDefinition(
        CLIPPER_HANDOFF_WORKFLOW_IDS.CREATE_EDITOR,
        CLIPPER_HANDOFF_ACTION_IDS.CREATE_EDITOR,
        'Create Clip Editor Project',
      ),
    );
    this.workflowRunner.registerWorkflow(
      clipperHandoffDefinition(
        CLIPPER_HANDOFF_WORKFLOW_IDS.PREPARE_PUBLISH,
        CLIPPER_HANDOFF_ACTION_IDS.PREPARE_PUBLISH,
        'Prepare Clip Publish Payload',
      ),
    );
    this.workflowRunner.registerWorkflow(
      clipperHandoffDefinition(
        CLIPPER_HANDOFF_WORKFLOW_IDS.LINK_LIBRARY,
        CLIPPER_HANDOFF_ACTION_IDS.LINK_LIBRARY,
        'Link Clip to Library',
      ),
    );
  }

  async createEditorHandoff(
    input: ClipperHandoffInput,
    context: { organizationId: string; userId: string },
  ): Promise<ClipEditorHandoffResult> {
    return this.runWorkflow<ClipEditorHandoffResult>(
      CLIPPER_HANDOFF_WORKFLOW_IDS.CREATE_EDITOR,
      CLIPPER_HANDOFF_ACTION_IDS.CREATE_EDITOR,
      input,
      context,
    );
  }

  async preparePublishHandoff(
    input: ClipperHandoffInput,
    context: { organizationId: string; userId: string },
  ): Promise<ClipPublishHandoffResult> {
    return this.runWorkflow<ClipPublishHandoffResult>(
      CLIPPER_HANDOFF_WORKFLOW_IDS.PREPARE_PUBLISH,
      CLIPPER_HANDOFF_ACTION_IDS.PREPARE_PUBLISH,
      input,
      context,
    );
  }

  async retryLibraryLink(
    input: ClipperHandoffInput,
    context: { organizationId: string; userId: string },
  ): Promise<ClipperLibraryLinkResult> {
    return this.runWorkflow<ClipperLibraryLinkResult>(
      CLIPPER_HANDOFF_WORKFLOW_IDS.LINK_LIBRARY,
      CLIPPER_HANDOFF_ACTION_IDS.LINK_LIBRARY,
      input,
      context,
    );
  }

  private async runWorkflow<T>(
    workflowId: (typeof CLIPPER_HANDOFF_WORKFLOW_IDS)[keyof typeof CLIPPER_HANDOFF_WORKFLOW_IDS],
    actionId: (typeof CLIPPER_HANDOFF_ACTION_IDS)[keyof typeof CLIPPER_HANDOFF_ACTION_IDS],
    input: ClipperHandoffInput,
    context: { organizationId: string; userId: string },
  ): Promise<T> {
    const { result } = await this.workflowRunner.runWorkflow<T>({
      actionType: actionId,
      canonicalId: workflowId,
      inputValues: input,
      organizationId: context.organizationId,
      source: 'clipper-project-handoff',
      userId: context.userId,
    });
    return result;
  }

  private async executeEditorHandoff(
    request: SystemWorkflowActionRequest,
  ): Promise<ClipEditorHandoffResult> {
    assertClipperWorkflowActor(request);
    const input = this.readInput(request.input);
    const organizationId = request.context.organizationId;
    const ownedProject = await this.resolveOwnedProject(
      input.projectId,
      organizationId,
    );
    await this.clipperProjectsService.reconcileTerminalState(
      input.projectId,
      organizationId,
      ownedProject,
    );
    const clipperResult = await this.resolveReadyClipperResult({
      action: 'edit',
      clipperResultId: input.clipperResultId,
      organizationId,
      projectId: input.projectId,
    });
    const videoUrl = this.resolveClipVideoUrl(clipperResult);
    const ingredientId = this.requireLinkedIngredientId(clipperResult);
    const durationFrames = this.resolveClipDurationFrames(clipperResult);
    const editorProject = await this.editorProjectsService.create({
      ...(input.brandId ? { brandId: input.brandId } : {}),
      config: {
        clipperHandoff: {
          clipperProjectId: input.projectId,
          clipperResultId: String(clipperResult.id),
          ingredientId,
          source: 'clipper-result',
        },
        name: `${this.readString(clipperResult.title) ?? 'Clip'} edit`,
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
              thumbnailUrl: this.readString(clipperResult.thumbnailUrl),
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
      clipperProjectId: input.projectId,
      clipperResultId: String(clipperResult.id),
      editorPath: `/editor/${editorProjectId}`,
      editorProjectId,
      videoUrl,
    };
  }

  private async executePublishHandoff(
    request: SystemWorkflowActionRequest,
  ): Promise<ClipPublishHandoffResult> {
    assertClipperWorkflowActor(request);
    const input = this.readInput(request.input);
    const organizationId = request.context.organizationId;
    const ownedProject = await this.resolveOwnedProject(
      input.projectId,
      organizationId,
    );
    await this.clipperProjectsService.reconcileTerminalState(
      input.projectId,
      organizationId,
      ownedProject,
    );
    const clipperResult = await this.resolveReadyClipperResult({
      action: 'publish',
      clipperResultId: input.clipperResultId,
      organizationId,
      projectId: input.projectId,
    });
    const clipperResultId = String(clipperResult.id);
    const ingredientId = this.requireLinkedIngredientId(clipperResult);
    const videoUrl = this.resolveClipVideoUrl(clipperResult);
    const summary = this.readString(clipperResult.summary);
    const title = this.readString(clipperResult.title);
    const payload = {
      assets: [
        {
          ...(summary ? { caption: summary } : {}),
          assetId: ingredientId,
          mediaUrl: videoUrl,
          mimeType: 'video/mp4',
        },
      ],
      clipperProjectId: input.projectId,
      confirmBeforePublish: true as const,
      metadata: {
        clipperResultId,
        ingredientId,
        ...(summary ? { summary } : {}),
        ...(title ? { title } : {}),
      },
      platforms: ['instagram'],
      preparedAt: new Date().toISOString(),
      schedule: 'immediate' as const,
    };
    this.logger.log('Clip publish handoff prepared', {
      clipperProjectId: input.projectId,
      clipperResultId,
    });
    return { clipperProjectId: input.projectId, clipperResultId, payload };
  }

  private async executeLibraryLink(
    request: SystemWorkflowActionRequest,
  ): Promise<ClipperLibraryLinkResult> {
    assertClipperWorkflowActor(request);
    const input = this.readInput(request.input);
    const organizationId = request.context.organizationId;
    await this.resolveOwnedProject(input.projectId, organizationId);
    const clipperResult =
      await this.clipperResultsService.findProjectResultForHandoff({
        clipperResultId: input.clipperResultId,
        organizationId,
        projectId: input.projectId,
      });
    if (!clipperResult) {
      throw new NotFoundException('ClipperResult', input.clipperResultId);
    }
    if (this.readString(clipperResult.status) !== 'completed') {
      throw new BadRequestException(
        `ClipperResult ${input.clipperResultId} is not ready for Library linking.`,
      );
    }
    return this.clipperLibraryLinkService.linkReadyClip({
      clipperResultId: String(clipperResult.id),
      organizationId,
    });
  }

  private async resolveOwnedProject(
    projectId: string,
    organizationId: string,
  ): Promise<ClipperProjectDocument> {
    const project = await this.clipperProjectsService.findOne({
      id: projectId,
      organizationId,
    });
    if (!project) {
      throw new NotFoundException('ClipperProject', projectId);
    }
    return project;
  }

  private async resolveReadyClipperResult(input: {
    action: ClipperReadyAction;
    clipperResultId: string;
    organizationId: string;
    projectId: string;
  }): Promise<ClipperResultDocument> {
    const clipperResult =
      await this.clipperResultsService.findProjectResultForHandoff({
        clipperResultId: input.clipperResultId,
        organizationId: input.organizationId,
        projectId: input.projectId,
      });
    if (!clipperResult) {
      throw new NotFoundException('ClipperResult', input.clipperResultId);
    }
    if (!this.isClipperReadyForAction(clipperResult, input.action)) {
      throw new BadRequestException(
        `ClipperResult ${input.clipperResultId} is not ready for ${input.action} handoff.`,
      );
    }
    this.resolveClipVideoUrl(clipperResult);
    return clipperResult;
  }

  private isClipperReadyForAction(
    clipperResult: ClipperResultDocument,
    action: ClipperReadyAction,
  ): boolean {
    const readiness = this.readRecord(clipperResult.readiness);
    const readyActions = Array.isArray(readiness.readyActions)
      ? readiness.readyActions
      : [];
    return readyActions.length > 0
      ? readyActions.includes(action)
      : this.readString(clipperResult.status) === 'completed';
  }

  private requireLinkedIngredientId(
    clipperResult: ClipperResultDocument,
  ): string {
    const ingredientId = this.readString(clipperResult.ingredientId);
    if (!ingredientId) {
      throw new BadRequestException(
        'Clip result is not linked to a Library asset. Retry Library linking first.',
      );
    }
    return ingredientId;
  }

  private resolveClipVideoUrl(clipperResult: ClipperResultDocument): string {
    const videoUrl =
      this.readString(clipperResult.captionedVideoUrl) ??
      this.readString(clipperResult.videoUrl);
    if (!videoUrl) {
      throw new BadRequestException('Clip result has no terminal video URL.');
    }
    return videoUrl;
  }

  private resolveClipDurationFrames(
    clipperResult: ClipperResultDocument,
  ): number {
    const duration =
      typeof clipperResult.duration === 'number' &&
      Number.isFinite(clipperResult.duration)
        ? clipperResult.duration
        : 10;
    return Math.max(1, Math.round(duration * 30));
  }

  private readInput(input: Record<string, unknown>): ClipperHandoffInput {
    const projectId = this.requiredString(input.projectId, 'projectId');
    const clipperResultId = this.requiredString(
      input.clipperResultId,
      'clipperResultId',
    );
    const brandId = this.readString(input.brandId);
    return { ...(brandId ? { brandId } : {}), clipperResultId, projectId };
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
