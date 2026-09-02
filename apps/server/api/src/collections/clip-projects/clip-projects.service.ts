import { CreateClipProjectDto } from '@api/collections/clip-projects/dto/create-clip-project.dto';
import { UpdateClipProjectDto } from '@api/collections/clip-projects/dto/update-clip-project.dto';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
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
  ClipReferenceFrameSet,
  ClipSourceContract,
} from '@genfeedai/contracts/interfaces';
import {
  ClipReferenceFrameValidationError,
  normalizeClipReferenceFrameSet,
} from '@genfeedai/helpers';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type ClipProjectWriteDto = Partial<
  CreateClipProjectDto & UpdateClipProjectDto
> &
  Record<string, unknown>;

type ClipProjectCreateInput = CreateClipProjectDto & {
  readonly source?: ClipSourceContract;
};

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
        readiness: buildClipProjectReadiness({
          status: 'generating',
        }) as unknown as Prisma.InputJsonValue,
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
