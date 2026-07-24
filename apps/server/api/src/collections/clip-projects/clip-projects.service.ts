import { CreateClipProjectDto } from '@api/collections/clip-projects/dto/create-clip-project.dto';
import { UpdateClipProjectDto } from '@api/collections/clip-projects/dto/update-clip-project.dto';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import {
  buildClipProjectReadiness,
  isTerminalClipStatus,
} from '@api/collections/clip-shared/clip-terminal-contract.util';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  ClipReferenceFrameValidationError,
  normalizeClipReferenceFrameSet,
} from '@genfeedai/helpers';
import type {
  ClipReferenceFrameSet,
  PopulateOption,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PopulateInput = (string | PopulateOption)[] | 'none';

type ClipProjectWriteDto = Partial<
  CreateClipProjectDto & UpdateClipProjectDto
> &
  Record<string, unknown>;

const PROJECT_SCALAR_KEYS = new Set([
  '_id',
  'brand',
  'brandId',
  'config',
  'error',
  'failedClipCount',
  'id',
  'isDeleted',
  'mongoId',
  'organization',
  'organizationId',
  'pendingClipCount',
  'progress',
  'readiness',
  'readyClipCount',
  'status',
  'terminalAt',
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
  ) {
    super(prisma, 'clipProject', logger);
  }

  override async create(
    createDto: CreateClipProjectDto & { readonly brand?: string },
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
  ): Promise<ClipProjectDocument> {
    const existing = await this.findOne({ _id: id, isDeleted: false });
    const existingConfig = this.readRecord(
      (existing as Record<string, unknown> | null)?.config,
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
        _id: projectId,
        isDeleted: false,
        ...(organizationId ? { organization: organizationId } : {}),
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
      (result) => this.readString(result.status) === 'failed',
    ).length;
    const pendingClipCount = results.length - readyClipCount - failedClipCount;

    const update: Record<string, unknown> = {
      failedClipCount,
      pendingClipCount,
      readyClipCount,
    };
    const settledClipCount = readyClipCount + failedClipCount;

    if (pendingClipCount === 0) {
      update.progress = 100;

      if (readyClipCount > 0) {
        update.error = null;
        update.status = 'completed';
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

    if (!this.hasReconciliationChange(project, update)) {
      return project;
    }

    return this.patch(canonicalProjectId, update);
  }

  private toPrismaWriteData(
    dto: ClipProjectWriteDto,
    mode: 'create' | 'update',
    existingConfig: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const config: Record<string, unknown> = { ...existingConfig };

    if (typeof dto.id === 'string' && dto.id.length > 0) {
      data.mongoId = dto.id;
    }

    if (typeof dto.mongoId === 'string' && dto.mongoId.length > 0) {
      data.mongoId = dto.mongoId;
    }

    if (typeof dto.organization === 'string') {
      data.organizationId = dto.organization;
    }

    if (typeof dto.organizationId === 'string') {
      data.organizationId = dto.organizationId;
    }

    if (Object.hasOwn(dto, 'brand')) {
      data.brandId = dto.brand ?? null;
    }

    if (Object.hasOwn(dto, 'brandId')) {
      data.brandId = dto.brandId ?? null;
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
      isTerminalClipStatus(data.status) &&
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
