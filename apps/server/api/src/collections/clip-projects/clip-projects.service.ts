import { CreateClipProjectDto } from '@api/collections/clip-projects/dto/create-clip-project.dto';
import { UpdateClipProjectDto } from '@api/collections/clip-projects/dto/update-clip-project.dto';
import type { UpdateClipProjectDraftDto } from '@api/collections/clip-projects/dto/update-clip-project-draft.dto';
import type {
  ClipProjectDocument,
  ClipProjectSettings,
} from '@api/collections/clip-projects/schemas/clip-project.schema';
import { ClipContinuityWorkflowService } from '@api/collections/clip-projects/services/clip-continuity-workflow.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import {
  buildClipProjectReadiness,
  isTerminalClipProjectStatus,
} from '@api/collections/clip-shared/clip-terminal-contract.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import type {
  ClipProjectDraft,
  ClipReferenceFrameSet,
  ClipSourceContract,
} from '@genfeedai/contracts/interfaces';
import {
  ClipReferenceFrameValidationError,
  normalizeClipReferenceFrameSet,
} from '@genfeedai/helpers';
import type { Prisma } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

type ClipProjectWriteDto = Partial<
  CreateClipProjectDto & UpdateClipProjectDto
> &
  Record<string, unknown>;

/** A draft has no source yet, so internal creates may omit its URL. */
export type ClipProjectCreateInput = Omit<
  CreateClipProjectDto,
  'sourceVideoUrl'
> & {
  readonly draft?: ClipProjectDraft | null;
  readonly source?: ClipSourceContract;
  readonly sourceVideoUrl?: string;
};

const DRAFT_WRITE_ATTEMPTS = 3;

const DRAFT_STARTED_MESSAGE =
  'This clip project has already started and its setup can no longer be edited.';

const PROJECT_SCALAR_KEYS = new Set([
  'brandId',
  'config',
  'continuityQaStatus',
  'continuityWorkflowExecutionId',
  'error',
  'failedClipCount',
  'isDeleted',
  'organizationId',
  'pendingClipCount',
  'progress',
  'readiness',
  'readyClipCount',
  'status',
  'terminalAt',
  'userId',
  'workflowExecutionId',
]);

@Injectable()
export class ClipProjectsService extends BaseService<
  ClipProjectDocument,
  CreateClipProjectDto,
  UpdateClipProjectDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly clipResultsService: ClipResultsService,
    private readonly clipContinuityWorkflow: ClipContinuityWorkflowService,
  ) {
    super(prisma, 'clipProject', logger);
  }

  protected override normalizeDocument(document: unknown): ClipProjectDocument {
    const record = super.normalizeDocument(document) as Record<string, unknown>;
    const config = this.readRecord(record.config);

    return { ...config, ...record } as ClipProjectDocument;
  }

  override async create(
    createDto: ClipProjectCreateInput,
    populate: PopulateInput = [],
  ): Promise<ClipProjectDocument> {
    return await super.create(
      this.toPrismaWriteData(
        createDto as unknown as ClipProjectWriteDto,
        'create',
      ) as unknown as CreateClipProjectDto,
      populate,
    );
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateClipProjectDto> | Record<string, unknown>,
    populate: PopulateInput = [],
    organizationId?: string,
  ): Promise<ClipProjectDocument> {
    const existing = await this.findOne({
      id: id,
      ...(organizationId !== undefined ? { organizationId } : {}),
    });
    if (!existing) {
      throw new NotFoundException('ClipProject', id);
    }

    const existingConfig = this.readRecord(
      (existing as Record<string, unknown>).config,
    );
    const canonicalId =
      typeof existing?.id === 'string' && existing.id.length > 0
        ? existing.id
        : id;

    return await super.patch(
      canonicalId,
      this.toPrismaWriteData(updateDto, 'update', existingConfig),
      populate,
    );
  }

  async selectReferenceFrame(
    projectId: string,
    organizationId: string,
    candidateId: string,
  ): Promise<ClipProjectDocument> {
    const project = await this.findOne({
      id: projectId,
      organizationId: organizationId,
    });

    if (!project) {
      throw new NotFoundException('ClipProject', projectId);
    }

    const referenceFrames = project.referenceFrames;
    if (!referenceFrames) {
      throw new BadRequestException(
        `Reference-frame candidate ${candidateId} does not belong to this project.`,
      );
    }

    const candidate = referenceFrames.candidates.find(
      (item) => item.id === candidateId,
    );

    if (!candidate) {
      throw new BadRequestException(
        `Reference-frame candidate ${candidateId} does not belong to this project.`,
      );
    }

    if (candidate.status !== 'available') {
      throw new BadRequestException(
        `Reference-frame candidate ${candidateId} is not available.`,
      );
    }

    if (referenceFrames.selectedCandidateId === candidateId) {
      return project;
    }

    return await this.patch(
      projectId,
      {
        referenceFrames: {
          ...referenceFrames,
          selectedCandidateId: candidateId,
          status: 'selected',
        },
      },
      [],
      organizationId,
    );
  }

  async reconcileTerminalState(
    projectId: string,
    organizationId?: string,
    preloadedProject?: ClipProjectDocument,
  ): Promise<ClipProjectDocument | null> {
    // Callers that already resolved+authorized the project (e.g. the handoff
    // endpoints) pass it through to avoid a second identical fetch.
    const project =
      preloadedProject ??
      (await this.findOne({
        id: projectId,
        ...(organizationId ? { organizationId: organizationId } : {}),
      }));

    if (!project) {
      return null;
    }

    const canonicalProjectId = this.readString(project.id) ?? projectId;
    const results = await this.clipResultsService.findByProject(
      canonicalProjectId,
      organizationId,
    );

    if (results.length === 0) {
      return project;
    }

    const readyClipCount = results.filter(
      (result) => this.readString(result.status) === 'completed',
    ).length;
    const failedClipCount = results.filter(
      (result) =>
        this.readString(result.status) === 'failed' ||
        this.readString(result.status) === 'degraded',
    ).length;
    const pendingClipCount = results.length - readyClipCount - failedClipCount;

    const update: Record<string, unknown> = {
      failedClipCount,
      pendingClipCount,
      readyClipCount,
    };
    const settledClipCount = readyClipCount + failedClipCount;
    const workflowReviewPending = await this.isWorkflowReviewPending(
      project.workflowExecutionId,
      String(project.organizationId),
    );

    if (workflowReviewPending) {
      update.error = null;
      update.progress = Math.min(99, Math.max(project.progress, 60));
      update.status = 'generating';
      update.terminalAt = null;
    } else if (pendingClipCount === 0) {
      update.progress = 100;

      if (readyClipCount > 0) {
        update.error =
          failedClipCount > 0
            ? `${failedClipCount} clip${failedClipCount === 1 ? '' : 's'} require${failedClipCount === 1 ? 's' : ''} retry or review.`
            : null;
        update.status =
          failedClipCount > 0 ? 'partially-completed' : 'completed';
      } else {
        update.error = 'All clip generations failed.';
        update.status = 'failed';
      }
    } else if (settledClipCount > 0) {
      const currentProgress =
        typeof project.progress === 'number' ? project.progress : 0;
      update.progress = Math.max(
        currentProgress,
        Math.min(99, 60 + Math.floor((settledClipCount / results.length) * 40)),
      );
    }

    const reconciledProject = this.hasReconciliationChange(project, update)
      ? await this.patch(canonicalProjectId, update, [], organizationId)
      : project;
    await this.clipContinuityWorkflow.queueIfReady(reconciledProject);
    return reconciledProject;
  }

  async claimFailedResultRetry(
    projectId: string,
    organizationId: string,
    pendingClipCount: number,
  ): Promise<boolean> {
    const result = await this.prisma.clipProject.updateMany({
      data: {
        error: null,
        failedClipCount: 0,
        pendingClipCount,
        readiness: toPrismaJson(
          buildClipProjectReadiness({
            status: 'generating',
          }),
        ),
        status: 'generating',
        terminalAt: null,
      },
      where: {
        id: projectId,
        isDeleted: false,
        organizationId,
        status: { in: ['failed', 'partially-completed'] },
      },
    });

    return result.count === 1;
  }

  async claimSourceRetry(
    project: ClipProjectDocument,
    organizationId: string,
    source: ClipSourceContract,
  ): Promise<boolean> {
    if (!project.updatedAt || project.source?.status !== 'failed') {
      return false;
    }
    const config = this.readRecord(project.config);
    const result = await this.prisma.clipProject.updateMany({
      data: {
        config: toPrismaJson({ ...config, source }),
        error: null,
        readiness: toPrismaJson(
          buildClipProjectReadiness({ status: 'pending' }),
        ),
        status: 'pending',
        terminalAt: null,
      },
      where: {
        id: project.id,
        isDeleted: false,
        organizationId,
        status: project.status,
        updatedAt: project.updatedAt,
      },
    });
    return result.count === 1;
  }

  async markSourceDispatchFailed(
    projectId: string,
    organizationId: string,
    source: ClipSourceContract,
  ): Promise<void> {
    const current = await this.findOne({
      id: projectId,
      isDeleted: false,
      organizationId,
    });
    if (
      current?.status !== 'pending' ||
      current.source?.status !== 'queued' ||
      current.source.fingerprint !== source.fingerprint ||
      current.source.retryCount !== source.retryCount
    ) {
      return;
    }
    const message = 'The source could not be queued. Retry source processing.';
    const config = this.readRecord(current.config);
    await this.prisma.clipProject.updateMany({
      data: {
        config: toPrismaJson({
          ...config,
          source: {
            ...current.source,
            jobId: source.jobId,
            failure: {
              code: 'clip_source_dispatch_failed',
              message,
              retryable: true,
            },
            status: 'failed',
            updatedAt: new Date().toISOString(),
          },
        }),
        error: message,
        readiness: toPrismaJson(
          buildClipProjectReadiness({ status: 'failed' }),
        ),
        status: 'failed',
      },
      where: {
        id: projectId,
        isDeleted: false,
        organizationId,
        status: 'pending',
        updatedAt: current.updatedAt,
      },
    });
  }

  async releaseSourceRetry(
    previous: ClipProjectDocument,
    organizationId: string,
    retryCount: number,
  ): Promise<void> {
    const current = await this.findOne({
      id: previous.id,
      isDeleted: false,
      organizationId,
    });
    if (
      current?.status !== 'pending' ||
      current.source?.status !== 'queued' ||
      current.source.retryCount !== retryCount
    ) {
      return;
    }
    // Preserve a worker's progress if dispatch failed after it started.
    const config = this.readRecord(current.config);
    await this.prisma.clipProject.updateMany({
      data: {
        config: toPrismaJson({ ...config, source: previous.source }),
        error: previous.error ?? null,
        readiness: toPrismaJson(
          previous.readiness ?? buildClipProjectReadiness({ status: 'failed' }),
        ),
        status: previous.status,
        terminalAt: previous.terminalAt ?? null,
      },
      where: {
        id: previous.id,
        isDeleted: false,
        organizationId,
        status: 'pending',
        updatedAt: current.updatedAt,
      },
    });
  }

  /**
   * Moves a `draft` project to `pending` exactly once, so a double-submitted
   * start converts the draft into one project run.
   */
  async claimDraft(
    projectId: string,
    organizationId: string,
    expectedUpdatedAt?: Date,
  ): Promise<boolean> {
    const result = await this.prisma.clipProject.updateMany({
      data: {
        error: null,
        readiness: toPrismaJson(
          buildClipProjectReadiness({
            status: 'pending',
          }),
        ),
        status: 'pending',
        terminalAt: null,
      },
      where: {
        id: projectId,
        isDeleted: false,
        organizationId,
        status: 'draft',
        // Compare-and-set on the version the caller validated; omitted when
        // the start carries its own source.
        updatedAt: expectedUpdatedAt,
      },
    });

    return result.count === 1;
  }

  /**
   * Autosaves new-project form fields onto a draft. The write is conditional on
   * the project still being a draft, so a save racing a start never rewrites
   * the settings of a project that is already running.
   */
  async saveDraft(
    projectId: string,
    organizationId: string,
    update: UpdateClipProjectDraftDto,
  ): Promise<ClipProjectDocument> {
    return await this.writeDraft(projectId, organizationId, (project) => {
      const draft: Partial<ClipProjectDraft> = project.draft ?? {};
      const settings: ClipProjectSettings = {
        ...(project.settings ?? {}),
        ...(update.mode !== undefined ? { mode: update.mode } : {}),
        ...(update.maxClips !== undefined ? { maxClips: update.maxClips } : {}),
        ...(update.minViralityScore !== undefined
          ? { minViralityScore: update.minViralityScore }
          : {}),
      };
      const nextDraft: ClipProjectDraft = {
        filename: update.filename ?? draft.filename,
        sourceKind: update.sourceKind ?? draft.sourceKind ?? 'youtube',
        updatedAt: new Date().toISOString(),
        youtubeUrl: update.youtubeUrl ?? draft.youtubeUrl,
      };

      return {
        config: toPrismaJson({
          ...this.readRecord((project as Record<string, unknown>).config),
          draft: nextDraft,
          settings,
        }),
      };
    });
  }

  /**
   * Writes project fields onto a project that is still a draft, keeping it a
   * draft. Used to attach a prepared upload, so a failed transfer can be
   * prepared again; the draft is claimed only once the upload is finalized.
   * Omitted fields keep their saved value.
   */
  async patchDraft(
    projectId: string,
    organizationId: string,
    update: Record<string, unknown>,
  ): Promise<ClipProjectDocument> {
    const fields = Object.fromEntries(
      Object.entries(update).filter(
        ([key, value]) => key !== 'status' && value !== undefined,
      ),
    );

    return await this.writeDraft(
      projectId,
      organizationId,
      (project) =>
        this.toPrismaWriteData(
          fields,
          'update',
          this.readRecord((project as Record<string, unknown>).config),
        ) as Prisma.ClipProjectUncheckedUpdateManyInput,
    );
  }

  /**
   * Returns a claimed draft to `draft` when its start could not be
   * dispatched, so the creator can start it again.
   */
  async releaseDraft(
    projectId: string,
    organizationId: string,
  ): Promise<boolean> {
    const project = await this.findOne({
      id: projectId,
      isDeleted: false,
      organizationId,
      status: 'pending',
    });
    if (!project) {
      return false;
    }

    // The failed start may already have marked the source queued with a job
    // id; put it back to its pre-start state so the next start dispatches.
    const config = this.readRecord((project as Record<string, unknown>).config);
    const source = this.readRecord(config.source);
    const { jobId: _jobId, ...retryableSource } = source;
    const result = await this.prisma.clipProject.updateMany({
      data: {
        config: toPrismaJson({
          ...config,
          ...(Object.keys(source).length > 0
            ? {
                source: {
                  ...retryableSource,
                  status: source.kind === 'upload' ? 'uploading' : 'queued',
                },
              }
            : {}),
        }),
        readiness: toPrismaJson(
          buildClipProjectReadiness({
            status: 'draft',
          }),
        ),
        status: 'draft',
      },
      where: {
        id: projectId,
        isDeleted: false,
        organizationId,
        status: 'pending',
      },
    });

    return result.count === 1;
  }

  /**
   * Draft config is one JSON column with two writers (autosave and upload
   * preparation). Each write is conditional on the row still being the draft
   * version it was built from, and is rebuilt from a fresh read when another
   * writer got there first, so neither can overwrite the other's fields.
   */
  private async writeDraft(
    projectId: string,
    organizationId: string,
    buildData: (
      project: ClipProjectDocument,
    ) => Prisma.ClipProjectUncheckedUpdateManyInput,
  ): Promise<ClipProjectDocument> {
    for (let attempt = 0; attempt < DRAFT_WRITE_ATTEMPTS; attempt += 1) {
      const project = await this.findOne({
        id: projectId,
        isDeleted: false,
        organizationId,
      });
      if (!project) {
        throw new NotFoundException('ClipProject', projectId);
      }
      if (project.status !== 'draft') {
        throw new ConflictException(DRAFT_STARTED_MESSAGE);
      }

      const result = await this.prisma.clipProject.updateMany({
        data: buildData(project),
        where: {
          id: projectId,
          isDeleted: false,
          organizationId,
          status: 'draft',
          updatedAt: project.updatedAt,
        },
      });
      if (result.count === 1) {
        return (
          (await this.findOne({
            id: projectId,
            isDeleted: false,
            organizationId,
          })) ?? project
        );
      }
    }

    throw new ConflictException(
      'This draft was changed by another save. Try again.',
    );
  }

  private toPrismaWriteData(
    dto: ClipProjectWriteDto,
    mode: 'create' | 'update',
    existingConfig: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const config: Record<string, unknown> = { ...existingConfig };

    if (typeof dto.organizationId === 'string') {
      data.organizationId = dto.organizationId;
    }

    if (Object.hasOwn(dto, 'brandId')) {
      data.brandId = dto.brandId ?? null;
    }

    if (Object.hasOwn(dto, 'userId')) {
      data.userId = dto.userId ?? null;
    }

    this.assignIfOwn(data, dto, 'status');
    this.assignIfOwn(data, dto, 'progress');
    this.assignIfOwn(data, dto, 'error');
    this.assignIfOwn(data, dto, 'readyClipCount');
    this.assignIfOwn(data, dto, 'failedClipCount');
    this.assignIfOwn(data, dto, 'pendingClipCount');
    this.assignIfOwn(data, dto, 'readiness');
    this.assignIfOwn(data, dto, 'terminalAt');
    this.assignIfOwn(data, dto, 'isDeleted');
    this.assignIfOwn(data, dto, 'workflowExecutionId');
    this.assignIfOwn(data, dto, 'continuityQaStatus');
    this.assignIfOwn(data, dto, 'continuityWorkflowExecutionId');

    for (const [key, value] of Object.entries(dto)) {
      if (PROJECT_SCALAR_KEYS.has(key) || value === undefined) {
        continue;
      }
      config[key] = value;
    }

    const suppliedConfig = this.readRecord(dto.config);
    const mergedConfig = { ...config, ...suppliedConfig };
    if (
      Object.hasOwn(mergedConfig, 'referenceFrames') &&
      mergedConfig.referenceFrames !== undefined
    ) {
      mergedConfig.referenceFrames = this.normalizeReferenceFrames(
        mergedConfig.referenceFrames,
      );
    }
    data.config = mergedConfig;

    this.applyTerminalDefaults(data, mode);

    return data;
  }

  private applyTerminalDefaults(
    data: Record<string, unknown>,
    mode: 'create' | 'update',
  ): void {
    if (mode === 'create' && typeof data.status !== 'string') {
      data.status = 'pending';
    }

    if (typeof data.status !== 'string') {
      return;
    }

    if (
      isTerminalClipProjectStatus(data.status) &&
      !Object.hasOwn(data, 'terminalAt')
    ) {
      data.terminalAt = new Date();
    }

    if (!Object.hasOwn(data, 'readiness')) {
      data.readiness = buildClipProjectReadiness({
        error: this.readString(data.error),
        status: data.status,
        terminalAt: this.readTerminalAt(data.terminalAt),
      });
    }
  }

  private assignIfOwn(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
    key: string,
  ): void {
    if (Object.hasOwn(source, key)) {
      target[key] = source[key];
    }
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private hasReconciliationChange(
    project: ClipProjectDocument,
    update: Record<string, unknown>,
  ): boolean {
    return Object.entries(update).some(
      ([key, value]) => project[key] !== value,
    );
  }

  private readTerminalAt(value: unknown): Date | string | null {
    if (value instanceof Date || typeof value === 'string' || value === null) {
      return value;
    }

    return null;
  }

  private async isWorkflowReviewPending(
    workflowExecutionId: string | null | undefined,
    organizationId: string,
  ): Promise<boolean> {
    if (!workflowExecutionId) {
      return false;
    }
    const execution = await this.prisma.workflowExecution.findFirst({
      select: { result: true, status: true },
      where: {
        id: workflowExecutionId,
        isDeleted: false,
        organizationId,
      },
    });
    if (!execution || String(execution.status) !== 'RUNNING') {
      return false;
    }
    const result = this.readRecord(execution.result);
    const metadata = this.readRecord(result.metadata);
    const pendingApproval = this.readRecord(metadata.pendingApproval);
    return typeof pendingApproval.nodeId === 'string';
  }

  private normalizeReferenceFrames(value: unknown): ClipReferenceFrameSet {
    try {
      return normalizeClipReferenceFrameSet(value);
    } catch (error: unknown) {
      if (error instanceof ClipReferenceFrameValidationError) {
        throw new ValidationException(error.message, 'referenceFrames', value);
      }
      throw error;
    }
  }
}
