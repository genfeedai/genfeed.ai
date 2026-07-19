import { CreateClipResultDto } from '@api/collections/clip-results/dto/create-clip-result.dto';
import { UpdateClipResultDto } from '@api/collections/clip-results/dto/update-clip-result.dto';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import {
  buildClipResultReadiness,
  isTerminalClipStatus,
} from '@api/collections/clip-shared/clip-terminal-contract.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { PopulateOption } from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PopulateInput = (string | PopulateOption)[] | 'none';

type ClipResultWriteDto = Partial<CreateClipResultDto & UpdateClipResultDto> &
  Record<string, unknown>;

const RESULT_SCALAR_KEYS = new Set([
  '_id',
  'data',
  'id',
  'isDeleted',
  'isSelected',
  'mode',
  'mongoId',
  'organization',
  'organizationId',
  'project',
  'projectId',
  'providerJobId',
  'readiness',
  'status',
  'terminalAt',
  'viralityScore',
]);

@Injectable()
export class ClipResultsService extends BaseService<
  ClipResultDocument,
  CreateClipResultDto,
  UpdateClipResultDto,
  Prisma.ClipResultWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'clipResult', logger);
  }

  override async create(
    createDto: CreateClipResultDto,
    populate: PopulateInput = [],
  ): Promise<ClipResultDocument> {
    return await super.create(
      this.toPrismaWriteData(
        createDto as unknown as ClipResultWriteDto,
        'create',
      ) as unknown as CreateClipResultDto,
      populate,
    );
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateClipResultDto> | Record<string, unknown>,
    populate: PopulateInput = [],
  ): Promise<ClipResultDocument> {
    const existing = await this.findOne({ _id: id, isDeleted: false });
    const existingData = this.readRecord(
      (existing as Record<string, unknown> | null)?.data,
    );
    const canonicalId =
      typeof existing?.id === 'string' && existing.id.length > 0
        ? existing.id
        : id;

    return await super.patch(
      canonicalId,
      this.toPrismaWriteData(updateDto, 'update', existingData),
      populate,
    );
  }

  async findByProject(
    projectId: string,
    organizationId?: string,
  ): Promise<ClipResultDocument[]> {
    const docs = await this.delegate.findMany({
      where: {
        isDeleted: false,
        ...(organizationId ? { organizationId } : {}),
        projectId,
      },
      orderBy: { viralityScore: 'desc' },
    });

    return this.normalizeDocuments(docs);
  }

  async findByProviderJobId(
    providerJobId: string,
  ): Promise<ClipResultDocument | null> {
    const result = await this.delegate.findFirst({
      where: {
        isDeleted: false,
        providerJobId,
      },
    });

    return result ? this.normalizeDocument(result) : null;
  }

  async countActiveRawCuts(): Promise<number> {
    return this.delegate.count({
      where: {
        isDeleted: false,
        mode: 'raw-cut',
        status: { in: ['extracting', 'captioning'] },
      },
    });
  }

  async findActiveRawCuts(
    limit = 100,
    skip = 0,
  ): Promise<ClipResultDocument[]> {
    const results = await this.delegate.findMany({
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      skip,
      take: limit,
      where: {
        isDeleted: false,
        mode: 'raw-cut',
        status: { in: ['extracting', 'captioning'] },
      },
    });

    return this.normalizeDocuments(results);
  }

  async countRawCutsPendingProjectReconciliation(): Promise<number> {
    return this.delegate.count({
      where: {
        data: {
          equals: true,
          path: ['isProjectReconciliationPending'],
        },
        isDeleted: false,
        mode: 'raw-cut',
        status: { in: ['completed', 'failed'] },
      },
    });
  }

  async findRawCutsPendingProjectReconciliation(
    limit = 100,
    skip = 0,
  ): Promise<ClipResultDocument[]> {
    const results = await this.delegate.findMany({
      orderBy: [{ terminalAt: 'asc' }, { id: 'asc' }],
      skip,
      take: limit,
      where: {
        data: {
          equals: true,
          path: ['isProjectReconciliationPending'],
        },
        isDeleted: false,
        mode: 'raw-cut',
        status: { in: ['completed', 'failed'] },
      },
    });

    return this.normalizeDocuments(results);
  }

  async findProjectResultForHandoff(input: {
    clipResultId: string;
    organizationId: string;
    projectId: string;
  }): Promise<ClipResultDocument | null> {
    const result = await this.delegate.findFirst({
      where: {
        OR: [
          { id: input.clipResultId },
          { mongoId: input.clipResultId },
          { providerJobId: input.clipResultId },
        ],
        isDeleted: false,
        organizationId: input.organizationId,
        projectId: input.projectId,
      },
    });

    return result ? this.normalizeDocument(result) : null;
  }

  private toPrismaWriteData(
    dto: ClipResultWriteDto,
    mode: 'create' | 'update',
    existingData: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const legacyData: Record<string, unknown> = { ...existingData };

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

    if (Object.hasOwn(dto, 'project')) {
      data.projectId = dto.project ?? null;
    }

    if (Object.hasOwn(dto, 'projectId')) {
      data.projectId = dto.projectId ?? null;
    }

    this.assignIfOwn(data, dto, 'providerJobId');
    this.assignIfOwn(data, dto, 'viralityScore');
    this.assignIfOwn(data, dto, 'mode');
    this.assignIfOwn(data, dto, 'status');
    this.assignIfOwn(data, dto, 'isSelected');
    this.assignIfOwn(data, dto, 'readiness');
    this.assignIfOwn(data, dto, 'terminalAt');
    this.assignIfOwn(data, dto, 'isDeleted');

    for (const [key, value] of Object.entries(dto)) {
      if (RESULT_SCALAR_KEYS.has(key) || value === undefined) {
        continue;
      }
      legacyData[key] = value;
    }

    const suppliedData = this.readRecord(dto.data);
    data.data = { ...legacyData, ...suppliedData };

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
      data.readiness = buildClipResultReadiness({
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

  private readTerminalAt(value: unknown): Date | string | null {
    if (value instanceof Date || typeof value === 'string' || value === null) {
      return value;
    }

    return null;
  }
}
